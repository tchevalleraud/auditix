<?php

namespace App\Service;

use App\Entity\Collection;
use App\Entity\ComplianceRule;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use Doctrine\ORM\EntityManagerInterface;
use phpseclib3\Net\SSH2;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class ComplianceEvaluator
{
    private const SSH_TIMEOUT = 30;
    private const READ_TIMEOUT = 30;
    private const PROMPT_REGEX = '/[#>\$\]]\s*$/';
    private const STABLE_WAIT = 2;

    public const SEVERITY_WEIGHTS = [
        'info' => 0,
        'low' => 1,
        'medium' => 3,
        'high' => 5,
        'critical' => 10,
    ];

    public function __construct(
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    /**
     * Evaluate a single rule against a single node.
     * Returns ['status' => string, 'severity' => ?string, 'message' => ?string]
     * or ['status' => 'skipped', 'message' => string] if the rule cannot be evaluated.
     */
    public function evaluateRule(ComplianceRule $rule, Node $node): array
    {
        if (!$rule->isEnabled()) {
            return ['status' => 'skipped', 'severity' => null, 'message' => 'Rule disabled'];
        }

        if ($rule->getSourceType() === ComplianceRule::SOURCE_NONE) {
            return ['status' => 'not_applicable', 'severity' => null, 'message' => 'No data source configured'];
        }

        $conditionTree = $rule->getConditionTree();
        if (!$conditionTree || empty($conditionTree['blocks'] ?? [])) {
            return ['status' => 'not_applicable', 'severity' => null, 'message' => 'No conditions configured'];
        }

        $sourceData = $this->getSourceData($rule, $node);
        if (isset($sourceData['error'])) {
            return ['status' => 'error', 'severity' => null, 'message' => $sourceData['error']];
        }

        $severityOrder = ['info' => 0, 'low' => 1, 'medium' => 2, 'high' => 3, 'critical' => 4];
        $statusOrder = ['not_applicable' => 0, 'compliant' => 1, 'error' => 2, 'non_compliant' => 3];

        if (isset($sourceData['rows']) && count($sourceData['rows']) > 1) {
            $worstEval = null;
            foreach ($sourceData['rows'] as $rowFields) {
                $eval = $this->evaluateBlocks($conditionTree['blocks'], $rowFields);
                if ($eval === null) continue;
                if ($worstEval === null) {
                    $worstEval = $eval;
                } else {
                    $curStatus = $statusOrder[$worstEval['status'] ?? ''] ?? -1;
                    $newStatus = $statusOrder[$eval['status'] ?? ''] ?? -1;
                    if ($newStatus > $curStatus) {
                        $worstEval = $eval;
                    } elseif ($newStatus === $curStatus && ($eval['status'] ?? '') === 'non_compliant') {
                        $curSev = $severityOrder[$worstEval['severity'] ?? ''] ?? -1;
                        $newSev = $severityOrder[$eval['severity'] ?? ''] ?? -1;
                        if ($newSev > $curSev) $worstEval = $eval;
                    }
                }
            }

            $mrm = $rule->getMultiRowMessages();
            if ($worstEval && $mrm) {
                $status = $worstEval['status'] ?? '';
                if (isset($mrm[$status]) && !empty($mrm[$status])) {
                    $worstEval['message'] = $mrm[$status];
                }
            }

            return $worstEval ?? ['status' => 'not_applicable', 'severity' => null, 'message' => null];
        }

        $evaluation = $this->evaluateBlocks($conditionTree['blocks'], $sourceData['fields']);
        return $evaluation ?? ['status' => 'not_applicable', 'severity' => null, 'message' => null];
    }

    /**
     * Calculate score grade (A-F) from compliance results.
     */
    public static function calculateGrade(int $totalRules, int $penaltySum): string
    {
        if ($totalRules === 0) return 'A';
        $maxWeight = $totalRules * 10;
        $percentage = max(0, ($maxWeight - $penaltySum) / $maxWeight * 100);

        if ($percentage >= 90) return 'A';
        if ($percentage >= 75) return 'B';
        if ($percentage >= 60) return 'C';
        if ($percentage >= 45) return 'D';
        if ($percentage >= 30) return 'E';
        return 'F';
    }

    public function getSourceData(ComplianceRule $rule, Node $node): array
    {
        $sourceType = $rule->getSourceType();

        if ($sourceType === ComplianceRule::SOURCE_INVENTORY) {
            $category = $rule->getSourceCategory();
            $key = $rule->getSourceKey();
            $valueLabel = $rule->getSourceValue() ?: 'Value#1';

            if (!$category || !$key) {
                return ['error' => 'Incomplete inventory source configuration'];
            }

            $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $node, 'category' => $category, 'entryKey' => $key, 'colLabel' => $valueLabel,
            ]);

            $values = array_map(fn(NodeInventoryEntry $e) => $e->getValue(), $entries);
            $value = empty($values) ? null : (count($values) === 1 ? $values[0] : implode(', ', $values));

            return [
                'fields' => ['$value' => $value],
                'summary' => ['sourceType' => 'inventory', 'value' => $value],
            ];
        }

        $foundContent = null;
        $summaryExtra = [];

        if ($sourceType === ComplianceRule::SOURCE_COLLECTION) {
            $command = $rule->getSourceCommand();
            if (!$command) return ['error' => 'No command configured'];

            $tag = $rule->getSourceTag();
            $commandSlug = $this->slugify($command);
            $conn = $this->em->getConnection();
            $sql = 'SELECT id FROM collection WHERE node_id = :node AND status = :status';
            $params = ['node' => $node->getId(), 'status' => Collection::STATUS_COMPLETED];
            if ($tag) { $sql .= ' AND tags::text LIKE :tag'; $params['tag'] = '%"' . $tag . '"%'; }
            $sql .= ' ORDER BY completed_at DESC LIMIT 1';
            $row = $conn->fetchAssociative($sql, $params);
            $collection = $row ? $this->em->getRepository(Collection::class)->find($row['id']) : null;

            if (!$collection) return ['error' => 'No completed collection found'];

            $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();
            if (is_dir($baseDir)) {
                foreach (scandir($baseDir) as $dir) {
                    if ($dir === '.' || $dir === '..') continue;
                    $filePath = $baseDir . '/' . $dir . '/' . $commandSlug . '.txt';
                    if (file_exists($filePath)) { $foundContent = file_get_contents($filePath); break; }
                }
            }
            if ($foundContent === null) return ['error' => 'No collected file found for command "' . $command . '"'];
            $summaryExtra['collectionId'] = $collection->getId();

        } elseif ($sourceType === ComplianceRule::SOURCE_SSH) {
            $command = $rule->getSourceCommand();
            if (!$command) return ['error' => 'No command configured'];

            $profile = $node->getProfile();
            $cliCred = $profile?->getCliCredential();
            if (!$cliCred || !$cliCred->getUsername()) return ['error' => 'No CLI credentials configured'];

            try {
                $ssh = new SSH2($node->getIpAddress(), $cliCred->getPort() ?: 22, self::SSH_TIMEOUT);
                $ssh->enablePTY();
                if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) return ['error' => 'SSH authentication failed'];
                $ssh->setTimeout(self::READ_TIMEOUT);
                $this->readFullResponse($ssh);
                $connectionScript = $node->getModel()?->getConnectionScript();
                if ($connectionScript) {
                    foreach (array_filter(array_map('trim', explode("\n", $connectionScript)), fn($l) => $l !== '') as $line) {
                        $ssh->write($line . "\n");
                        $this->readFullResponse($ssh);
                    }
                }
                $ssh->write($command . "\n");
                $response = $this->readFullResponse($ssh);
                $responseLines = explode("\n", $response);
                if (!empty($responseLines) && str_contains($responseLines[0], trim($command))) array_shift($responseLines);
                if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) array_pop($responseLines);
                $ssh->disconnect();
                $foundContent = implode("\n", $responseLines);
            } catch (\Throwable $e) {
                return ['error' => 'SSH error: ' . $e->getMessage()];
            }
        } else {
            return ['error' => 'No data source configured'];
        }

        $regex = $rule->getSourceRegex();
        $resultMode = $rule->getSourceResultMode();
        $fields = ['$value' => $foundContent];

        if ($regex && $resultMode) {
            $pattern = '~' . str_replace('~', '\\~', $regex) . '~m';

            if ($resultMode === ComplianceRule::RESULT_MATCH) {
                $fields['$match'] = (bool) @preg_match($pattern, $foundContent);
            } elseif ($resultMode === ComplianceRule::RESULT_COUNT) {
                $fields['$count'] = (int) @preg_match_all($pattern, $foundContent);
            } else {
                $allMatches = $this->extractCapture($rule, $pattern, $foundContent);
                $fields['$count'] = count($allMatches);

                if (!empty($allMatches) && is_array($allMatches[0])) {
                    $rows = [];
                    foreach ($allMatches as $match) {
                        $rowFields = [];
                        foreach ($match as $label => $val) {
                            if ($label === '_key') {
                                $rowFields['$key'] = $val;
                            } else {
                                $rowFields[$label] = $val;
                            }
                        }
                        $rowFields['$count'] = count($allMatches);
                        $rows[] = $rowFields;
                    }
                    foreach ($rows[0] as $k => $v) $fields[$k] = $v;

                    return [
                        'fields' => $fields,
                        'rows' => $rows,
                        'summary' => array_merge(['sourceType' => $sourceType, 'resultMode' => $resultMode], $summaryExtra),
                    ];
                } elseif (!empty($allMatches)) {
                    $fields['$value'] = $allMatches[0];
                }
            }
        }

        return [
            'fields' => $fields,
            'summary' => array_merge(['sourceType' => $sourceType, 'resultMode' => $resultMode], $summaryExtra),
        ];
    }

    public function evaluateBlocks(array $blocks, array $fields): ?array
    {
        foreach ($blocks as $block) {
            if ($block['type'] === 'else' || $this->evaluateConditions($block, $fields)) {
                if (!empty($block['children'])) {
                    return $this->evaluateBlocks($block['children'], $fields);
                }
                return $block['result'] ?? null;
            }
        }
        return null;
    }

    public function evaluateConditions(array $block, array $fields): bool
    {
        $logic = $block['logic'] ?? 'and';
        $conditions = $block['conditions'] ?? [];
        if (empty($conditions)) return true;

        foreach ($conditions as $cond) {
            $result = $this->evaluateSingle($cond, $fields);
            if ($logic === 'or' && $result) return true;
            if ($logic === 'and' && !$result) return false;
        }
        return $logic === 'and';
    }

    public function evaluateSingle(array $cond, array $fields): bool
    {
        $field = $cond['field'] ?? '';
        $fieldValue = $fields[$field] ?? null;
        $compareValue = $cond['value'] ?? null;

        if (is_array($fieldValue)) {
            $fieldValue = json_encode($fieldValue);
        }

        return match ($cond['operator'] ?? '') {
            'equals' => (string) $fieldValue === (string) $compareValue,
            'not_equals' => (string) $fieldValue !== (string) $compareValue,
            'exists' => $fieldValue !== null,
            'not_exists' => $fieldValue === null,
            'contains' => is_string($fieldValue) && str_contains($fieldValue, (string) $compareValue),
            'not_contains' => !is_string($fieldValue) || !str_contains($fieldValue, (string) $compareValue),
            'matches' => is_string($fieldValue) && (bool) @preg_match('~' . str_replace('~', '\\~', (string) $compareValue) . '~', $fieldValue),
            'greater_than' => is_numeric($fieldValue) && is_numeric($compareValue) && (float) $fieldValue > (float) $compareValue,
            'less_than' => is_numeric($fieldValue) && is_numeric($compareValue) && (float) $fieldValue < (float) $compareValue,
            'is_empty' => $fieldValue === null || $fieldValue === '' || $fieldValue === '[]',
            'is_not_empty' => $fieldValue !== null && $fieldValue !== '' && $fieldValue !== '[]',
            default => false,
        };
    }

    public function extractCapture(ComplianceRule $rule, string $pattern, string $content): array
    {
        $valueMap = $rule->getSourceValueMap();
        $keyGroup = $rule->getSourceKeyGroup();
        $allMatches = [];
        @preg_match_all($pattern, $content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            if ($valueMap && count($valueMap) > 0) {
                $row = [];
                if ($keyGroup !== null) {
                    $row['_key'] = $match[$keyGroup] ?? null;
                }
                foreach ($valueMap as $mapping) {
                    $group = $mapping['group'] ?? 0;
                    $label = $mapping['label'] ?? 'Group ' . $group;
                    $row[$label] = $match[$group] ?? null;
                }
                $allMatches[] = $row;
            } else {
                $allMatches[] = $match[1] ?? $match[0];
            }
        }

        return $allMatches;
    }

    public function readFullResponse(SSH2 $ssh): string
    {
        $output = $ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);

        $ssh->setTimeout(self::STABLE_WAIT);

        while (true) {
            $extra = @$ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);
            if ($extra === false || $extra === '') {
                break;
            }
            $output .= $extra;
        }

        $ssh->setTimeout(self::READ_TIMEOUT);
        return $output;
    }

    public function slugify(string $text): string
    {
        $text = preg_replace('/[^a-z0-9]+/i', '-', $text);
        return strtolower(trim($text, '-'));
    }
}

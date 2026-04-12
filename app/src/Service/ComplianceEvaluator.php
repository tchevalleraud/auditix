<?php

namespace App\Service;

use App\Entity\Collection;
use App\Entity\ComplianceRule;
use App\Entity\InventoryCategory;
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
        'info' => 1,
        'low' => 3,
        'medium' => 5,
        'high' => 8,
        'critical' => 10,
    ];

    public function __construct(
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    /**
     * Evaluate a single rule against a single node.
     */
    public function evaluateRule(ComplianceRule $rule, Node $node): array
    {
        if (!$rule->isEnabled()) {
            return ['status' => 'skipped', 'severity' => null, 'message' => 'Rule disabled'];
        }

        $conditionTree = $rule->getConditionTree();
        if (!$conditionTree || empty($conditionTree['blocks'] ?? [])) {
            return ['status' => 'not_applicable', 'severity' => null, 'message' => 'No conditions configured'];
        }

        // Collect fields from all data sources
        $fields = $this->getAllSourceFields($rule, $node);
        if (isset($fields['_error'])) {
            return ['status' => 'error', 'severity' => null, 'message' => $fields['_error']];
        }

        // Detect multi-row sources → evaluate per row independently
        $multiRowSource = null;
        $secondaryMultiRowSources = [];
        foreach ($rule->getDataSources() as $src) {
            if (!empty($src['multiRow'])) {
                $name = $src['name'] ?? 'default';
                $rows = $fields["$name.\$rows"] ?? null;
                if (is_array($rows) && !empty($rows)) {
                    if ($multiRowSource === null) {
                        $multiRowSource = ['name' => $name, 'rows' => $rows];
                    } else {
                        // Index secondary rows by their _key for join
                        $indexed = [];
                        foreach ($rows as $r) {
                            $k = $r['_key'] ?? null;
                            if ($k !== null) $indexed[$k] = $r;
                        }
                        $secondaryMultiRowSources[] = ['name' => $name, 'rowsByKey' => $indexed];
                    }
                }
            }
        }

        if ($multiRowSource) {
            return $this->evaluateMultiRow($rule, $node, $conditionTree, $fields, $multiRowSource, $secondaryMultiRowSources);
        }

        $evaluation = $this->evaluateBlocks($conditionTree['blocks'], $fields, $node);
        if ($evaluation === null) {
            return ['status' => 'not_applicable', 'severity' => null, 'message' => null];
        }

        // Resolve recommendation template variables
        if (!empty($evaluation['recommendation'])) {
            $expectedValues = $this->findExpectedValues($conditionTree['blocks'], $node);
            $evaluation['recommendation'] = $this->resolveTemplate(
                $evaluation['recommendation'],
                $fields,
                $expectedValues
            );
        }

        return $evaluation;
    }

    /**
     * Multi-row evaluation: run the condition tree independently for each row.
     * Final result = worst status across all rows.
     */
    private function evaluateMultiRow(ComplianceRule $rule, Node $node, array $conditionTree, array $fields, array $multiRowSource, array $secondaryMultiRowSources = []): array
    {
        $statusPriority = ['compliant' => 0, 'not_applicable' => 1, 'skipped' => 2, 'error' => 3, 'non_compliant' => 4];
        $srcName = $multiRowSource['name'];
        $worst = null;
        $rowResults = [];

        foreach ($multiRowSource['rows'] as $row) {
            // Inject this row's values as source.field (overriding any previous)
            $rowFields = $fields;
            $rowKey = $row['_key'] ?? null;
            foreach ($row as $label => $val) {
                if ($label === '_key') {
                    $rowFields["$srcName.\$key"] = $val;
                } else {
                    $rowFields["$srcName.$label"] = is_string($val) ? trim($val) : $val;
                }
            }

            // Inject matching rows from secondary multi-row sources (join by key)
            if ($rowKey !== null) {
                foreach ($secondaryMultiRowSources as $sec) {
                    $secName = $sec['name'];
                    $secRow = $sec['rowsByKey'][$rowKey] ?? null;
                    if ($secRow) {
                        foreach ($secRow as $label => $val) {
                            if ($label === '_key') {
                                $rowFields["$secName.\$key"] = $val;
                            } else {
                                $rowFields["$secName.$label"] = is_string($val) ? trim($val) : $val;
                            }
                        }
                    }
                }
            }

            $rowEval = $this->evaluateBlocks($conditionTree['blocks'], $rowFields, $node);
            $rowKey = $row['_key'] ?? count($rowResults);

            if ($rowEval === null) {
                $rowEval = ['status' => 'not_applicable', 'severity' => null, 'message' => null];
            }
            $rowResults[] = ['key' => $rowKey, 'evaluation' => $rowEval];

            if (!$worst || ($statusPriority[$rowEval['status']] ?? 0) > ($statusPriority[$worst['status']] ?? 0)) {
                $worst = $rowEval;
            }
        }

        $result = $worst ?? ['status' => 'not_applicable', 'severity' => null, 'message' => null];
        $result['multiRowResults'] = $rowResults;

        // Use multiRowMessages for the global message if configured
        $multiRowMessages = $rule->getMultiRowMessages();
        if (!empty($multiRowMessages) && isset($multiRowMessages[$result['status']])) {
            $result['message'] = $multiRowMessages[$result['status']];
        } else {
            // Build a summary message from per-row results
            $summary = [];
            foreach ($rowResults as $rr) {
                $key = $rr['key'];
                $st = $rr['evaluation']['status'] ?? 'unknown';
                $msg = $rr['evaluation']['message'] ?? '';
                $summary[] = "[$key] $st" . ($msg ? ": $msg" : '');
            }
            $result['message'] = implode("\n", $summary);
        }

        // Resolve recommendation template
        if (!empty($result['recommendation'])) {
            $expectedValues = $this->findExpectedValues($conditionTree['blocks'], $node);
            $result['recommendation'] = $this->resolveTemplate($result['recommendation'], $fields, $expectedValues);
        }

        return $result;
    }

    /**
     * Collect fields from all data sources defined on the rule.
     * Returns a flat dict with keys like "sourceName.$value", "sourceName.$match", etc.
     */
    public function getAllSourceFields(ComplianceRule $rule, Node $node): array
    {
        $allFields = [];

        // Pre-resolve collections per tag so all data sources sharing the same
        // tag (or no tag) read from the exact same collection.
        $collectionBaseDirs = []; // keyed by tag ('' for no tag)

        foreach ($rule->getDataSources() as $src) {
            if (($src['type'] ?? '') !== 'collection') continue;
            $tag = $src['tag'] ?? null;
            $cacheKey = $tag ?? '';
            if (isset($collectionBaseDirs[$cacheKey])) continue;

            $conn = $this->em->getConnection();
            $sql = 'SELECT id FROM collection WHERE node_id = :node AND status = :status';
            $params = ['node' => $node->getId(), 'status' => Collection::STATUS_COMPLETED];
            if ($tag) { $sql .= ' AND tags::text LIKE :tag'; $params['tag'] = '%"' . $tag . '"%'; }
            $sql .= ' ORDER BY completed_at DESC LIMIT 1';
            $row = $conn->fetchAssociative($sql, $params);
            $collection = $row ? $this->em->getRepository(Collection::class)->find($row['id']) : null;

            if ($collection) {
                $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();
                $collectionBaseDirs[$cacheKey] = is_dir($baseDir) ? $baseDir : null;
            } else {
                $collectionBaseDirs[$cacheKey] = null;
            }
        }

        // For each tag group, find a preferred instance subdirectory that
        // contains ALL commands required by the data sources in that group.
        // This ensures data sources sharing the same collection+tag always
        // read from the same CollectionCommand instance.
        $preferredInstance = []; // keyed by tag cacheKey → subdirectory name

        foreach (array_keys($collectionBaseDirs) as $cacheKey) {
            $baseDir = $collectionBaseDirs[$cacheKey];
            if (!$baseDir) continue;

            $commandSlugs = [];
            foreach ($rule->getDataSources() as $src) {
                if (($src['type'] ?? '') !== 'collection') continue;
                $srcTag = ($src['tag'] ?? null) ?? '';
                if ($srcTag !== $cacheKey) continue;
                $cmd = $src['command'] ?? '';
                if ($cmd) $commandSlugs[] = $this->slugify($cmd);
            }
            if (empty($commandSlugs)) continue;

            // Find first subdirectory containing ALL required command files
            foreach (scandir($baseDir) as $dir) {
                if ($dir === '.' || $dir === '..') continue;
                if (!is_dir($baseDir . '/' . $dir)) continue;
                $allFound = true;
                foreach ($commandSlugs as $slug) {
                    if (!file_exists($baseDir . '/' . $dir . '/' . $slug . '.txt')) {
                        $allFound = false;
                        break;
                    }
                }
                if ($allFound) {
                    $preferredInstance[$cacheKey] = $dir;
                    break;
                }
            }
        }

        foreach ($rule->getDataSources() as $src) {
            $name = $src['name'] ?? 'default';
            $type = $src['type'] ?? '';
            $command = $src['command'] ?? '';
            $tag = $src['tag'] ?? null;
            $regex = $src['regex'] ?? null;
            $resultMode = $src['resultMode'] ?? null;
            $valueMap = $src['valueMap'] ?? null;
            $keyGroup = $src['keyGroup'] ?? null;
            $multiRow = !empty($src['multiRow']);

            if (!$command) {
                $allFields['_error'] = "Source \"$name\": no command configured";
                return $allFields;
            }

            // Fetch raw content
            $foundContent = null;
            if ($type === 'collection') {
                $cacheKey = $tag ?? '';
                $baseDir = $collectionBaseDirs[$cacheKey] ?? null;
                if (!$baseDir) {
                    $allFields['_error'] = "Source \"$name\": no completed collection found for command \"$command\"";
                    return $allFields;
                }

                // Use the preferred instance if available, otherwise scan all
                $preferred = $preferredInstance[$cacheKey] ?? null;
                if ($preferred) {
                    $commandSlug = $this->slugify($command);
                    $filePath = $baseDir . '/' . $preferred . '/' . $commandSlug . '.txt';
                    $foundContent = file_exists($filePath) ? file_get_contents($filePath) : null;
                }
                if ($foundContent === null) {
                    $foundContent = $this->fetchCollectionContentFromDir($baseDir, $command);
                }
                if ($foundContent === null) {
                    $allFields['_error'] = "Source \"$name\": command \"$command\" not found in collection";
                    return $allFields;
                }
            } elseif ($type === 'ssh') {
                $result = $this->fetchSshContent($node, $command);
                if (is_array($result) && isset($result['error'])) {
                    $allFields['_error'] = "Source \"$name\": " . $result['error'];
                    return $allFields;
                }
                $foundContent = $result;
            } else {
                continue;
            }

            // Base field: raw value
            $allFields["$name.\$value"] = $foundContent;

            // Apply regex extraction
            if ($regex && $resultMode) {
                $pattern = '~' . str_replace('~', '\\~', $regex) . '~m';

                if ($resultMode === ComplianceRule::RESULT_MATCH) {
                    $allFields["$name.\$match"] = (bool) @preg_match($pattern, $foundContent);
                } elseif ($resultMode === ComplianceRule::RESULT_COUNT) {
                    $allFields["$name.\$count"] = (int) @preg_match_all($pattern, $foundContent);
                } else {
                    // Capture mode
                    $captures = $this->extractCapture($pattern, $foundContent, $valueMap, $keyGroup);
                    $allFields["$name.\$count"] = count($captures);

                    if ($multiRow && !empty($captures) && is_array($captures[0] ?? null)) {
                        // Multi-row: store ALL matches indexed by key or row number
                        $allFields["$name.\$rows"] = $captures;
                        foreach ($captures as $i => $row) {
                            $rowKey = isset($row['_key']) && $row['_key'] !== null ? $row['_key'] : (string) $i;
                            foreach ($row as $label => $val) {
                                if ($label === '_key') continue;
                                $allFields["$name.$rowKey.$label"] = $val;
                            }
                        }
                    } elseif (!empty($captures) && is_array($captures[0] ?? null)) {
                        // Single-row: use first match only (existing behavior)
                        $first = $captures[0];
                        foreach ($first as $label => $val) {
                            if ($label === '_key') {
                                $allFields["$name.\$key"] = $val;
                            } else {
                                $allFields["$name.$label"] = $val;
                            }
                        }
                    } elseif (!empty($captures)) {
                        $allFields["$name.\$value"] = is_string($captures[0]) ? rtrim($captures[0], "\r") : $captures[0];
                    }
                }
            }
        }

        return $allFields;
    }

    /**
     * Fetch content from the latest completed collection for a node+command.
     */
    private function fetchCollectionContent(Node $node, string $command, ?string $tag): ?string
    {
        $conn = $this->em->getConnection();
        $sql = 'SELECT id FROM collection WHERE node_id = :node AND status = :status';
        $params = ['node' => $node->getId(), 'status' => Collection::STATUS_COMPLETED];
        if ($tag) { $sql .= ' AND tags::text LIKE :tag'; $params['tag'] = '%"' . $tag . '"%'; }
        $sql .= ' ORDER BY completed_at DESC LIMIT 1';
        $row = $conn->fetchAssociative($sql, $params);
        $collection = $row ? $this->em->getRepository(Collection::class)->find($row['id']) : null;

        if (!$collection) return null;

        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();
        if (!is_dir($baseDir)) return null;

        return $this->fetchCollectionContentFromDir($baseDir, $command);
    }

    /**
     * Find a command output file within a collection base directory (scanning all instance subdirectories).
     */
    private function fetchCollectionContentFromDir(string $baseDir, string $command): ?string
    {
        $commandSlug = $this->slugify($command);

        foreach (scandir($baseDir) as $dir) {
            if ($dir === '.' || $dir === '..') continue;
            $filePath = $baseDir . '/' . $dir . '/' . $commandSlug . '.txt';
            if (file_exists($filePath)) return file_get_contents($filePath);
        }

        return null;
    }

    /**
     * Fetch content via live SSH.
     */
    private function fetchSshContent(Node $node, string $command): string|array
    {
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
                    if (preg_match('/^\^([A-Za-z])$/', $line, $m)) {
                        $ssh->write(chr(ord(strtoupper($m[1])) - 64));
                    } else {
                        $ssh->write($line . "\n");
                    }
                    $this->readFullResponse($ssh);
                }
            }
            $ssh->write($command . "\n");
            $response = $this->readFullResponse($ssh);
            $responseLines = explode("\n", $response);
            if (!empty($responseLines) && str_contains($responseLines[0], trim($command))) array_shift($responseLines);
            if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) array_pop($responseLines);
            $ssh->disconnect();
            return implode("\n", $responseLines);
        } catch (\Throwable $e) {
            return ['error' => 'SSH error: ' . $e->getMessage()];
        }
    }

    /**
     * Get an inventory value for a node.
     */
    public function getInventoryValue(?int $categoryId, ?string $key, ?string $column, Node $node): ?string
    {
        if (!$categoryId || !$key) return null;

        $category = $this->em->getRepository(InventoryCategory::class)->find($categoryId);
        if (!$category) return null;

        $col = $column ?: 'Value#1';
        $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy([
            'node' => $node, 'category' => $category, 'entryKey' => $key, 'colLabel' => $col,
        ]);

        $values = array_map(fn(NodeInventoryEntry $e) => $e->getValue(), $entries);
        return empty($values) ? null : (count($values) === 1 ? $values[0] : implode(', ', $values));
    }

    // ---- Condition evaluation ----

    public function evaluateBlocks(array $blocks, array $fields, ?Node $node = null): ?array
    {
        foreach ($blocks as $block) {
            if ($block['type'] === 'else' || $this->evaluateConditions($block, $fields, $node)) {
                if (!empty($block['children'])) {
                    return $this->evaluateBlocks($block['children'], $fields, $node);
                }
                return $block['result'] ?? null;
            }
        }
        return null;
    }

    public function evaluateConditions(array $block, array $fields, ?Node $node = null): bool
    {
        $logic = $block['logic'] ?? 'and';
        $conditions = $block['conditions'] ?? [];
        if (empty($conditions)) return true;

        $evaluated = 0;

        foreach ($conditions as $cond) {
            // Node filter: by nodeId, tag, manufacturer or model
            if ($node !== null) {
                $condNodeId = $cond['nodeId'] ?? null;
                $condNodeTagId = $cond['nodeTagId'] ?? null;
                $condMfrId = $cond['nodeManufacturerId'] ?? null;
                $condModelId = $cond['nodeModelId'] ?? null;

                if ($condNodeId !== null && (int) $condNodeId !== $node->getId()) {
                    continue;
                }
                if ($condNodeTagId !== null) {
                    $hasTag = false;
                    foreach ($node->getTags() as $tag) {
                        if ($tag->getId() === (int) $condNodeTagId) { $hasTag = true; break; }
                    }
                    if (!$hasTag) continue;
                }
                if ($condMfrId !== null) {
                    if (!$node->getManufacturer() || $node->getManufacturer()->getId() !== (int) $condMfrId) continue;
                }
                if ($condModelId !== null) {
                    if (!$node->getModel() || $node->getModel()->getId() !== (int) $condModelId) continue;
                }
            }

            $evaluated++;
            $result = $this->evaluateSingleCondition($cond, $fields, $node);
            if ($logic === 'or' && $result) return true;
            if ($logic === 'and' && !$result) return false;
        }

        if ($evaluated === 0) return false;

        return $logic === 'and';
    }

    /**
     * Evaluate a single condition. Supports both 'source' and 'inventory' types.
     */
    public function evaluateSingleCondition(array $cond, array $fields, ?Node $node = null): bool
    {
        $type = $cond['type'] ?? 'source';
        $fieldValue = null;

        if ($type === 'inventory') {
            // Direct inventory lookup
            if ($node) {
                $fieldValue = $this->getInventoryValue(
                    $cond['inventoryCategoryId'] ?? null,
                    $cond['inventoryKey'] ?? null,
                    $cond['inventoryColumn'] ?? null,
                    $node
                );
            }
        } else {
            // Source field lookup: "sourceName.fieldName"
            $source = $cond['source'] ?? '';
            $field = $cond['field'] ?? '$value';

            // Multi-row wildcard: source.*.field → check ALL rows
            if (str_contains($field, '*.')) {
                $actualField = str_replace('*.', '', $field);
                $rows = $fields["$source.\$rows"] ?? null;
                if (is_array($rows) && !empty($rows)) {
                    $operator = $cond['operator'] ?? '';
                    $compareValue = $cond['value'] ?? null;
                    // ALL rows must match the condition
                    foreach ($rows as $row) {
                        $rowVal = isset($row[$actualField]) ? trim((string) $row[$actualField]) : null;
                        if (!$this->compareValue($rowVal, $operator, $compareValue)) {
                            return false;
                        }
                    }
                    return true;
                }
                return false; // no rows = condition fails
            } else {
                $key = $source ? "$source.$field" : $field;
                $fieldValue = $fields[$key] ?? null;
            }
        }

        return $this->compareValue($fieldValue, $cond['operator'] ?? '', $cond['value'] ?? null);
    }

    /**
     * Compare a field value against operator and compare value.
     */
    public function compareValue(mixed $fieldValue, string $operator, mixed $compareValue): bool
    {
        if (is_array($fieldValue)) {
            $fieldValue = json_encode($fieldValue);
        }

        return match ($operator) {
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

    // ---- Extraction helpers ----

    public function extractCapture(string $pattern, string $content, ?array $valueMap, ?int $keyGroup): array
    {
        $allMatches = [];
        @preg_match_all($pattern, $content, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            // Trim \r from all captured groups (network devices use CR+LF)
            $match = array_map(fn($v) => is_string($v) ? rtrim($v, "\r") : $v, $match);

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

    // ---- Score calculation ----

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

    // ---- SSH / utility helpers ----

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

    /**
     * Resolve {{variable}} placeholders in a template string.
     * Supports: {{source.field}} for actual values, {{expected.field}} for expected values from sibling conditions.
     */
    private function resolveTemplate(string $template, array $fields, array $expectedValues): string
    {
        return preg_replace_callback('/\{\{(.+?)\}\}/', function ($m) use ($fields, $expectedValues) {
            $var = trim($m[1]);
            // Check expected values first (from sibling conditions targeting this node)
            if (str_starts_with($var, 'expected.')) {
                $key = substr($var, 9); // remove "expected."
                return $expectedValues[$key] ?? $m[0];
            }
            // Then check source fields
            return isset($fields[$var]) ? (string)$fields[$var] : $m[0];
        }, $template);
    }

    /**
     * Search all blocks recursively for conditions targeting a specific node.
     * Returns expected values: field => value from "equals" conditions with matching nodeId.
     */
    private function findExpectedValues(array $blocks, ?Node $node): array
    {
        if (!$node) return [];
        $expected = [];
        $this->collectExpectedFromBlocks($blocks, $node, $expected);
        return $expected;
    }

    private function collectExpectedFromBlocks(array $blocks, Node $node, array &$expected): void
    {
        $nodeId = $node->getId();
        $nodeTagIds = [];
        foreach ($node->getTags() as $tag) {
            $nodeTagIds[] = $tag->getId();
        }

        foreach ($blocks as $block) {
            foreach (($block['conditions'] ?? []) as $cond) {
                $condNodeId = $cond['nodeId'] ?? null;
                $condNodeTagId = $cond['nodeTagId'] ?? null;
                $condMfrId = $cond['nodeManufacturerId'] ?? null;
                $condModelId = $cond['nodeModelId'] ?? null;

                $matches = false;
                if ($condNodeId !== null && (int)$condNodeId === $nodeId) $matches = true;
                if ($condNodeTagId !== null && in_array((int)$condNodeTagId, $nodeTagIds, true)) $matches = true;
                if ($condMfrId !== null && $node->getManufacturer() && $node->getManufacturer()->getId() === (int)$condMfrId) $matches = true;
                if ($condModelId !== null && $node->getModel() && $node->getModel()->getId() === (int)$condModelId) $matches = true;

                if ($matches) {
                    $op = $cond['operator'] ?? '';
                    $val = $cond['value'] ?? null;
                    if ($op === 'equals' && $val !== null) {
                        $type = $cond['type'] ?? 'source';
                        if ($type === 'source') {
                            $key = ($cond['source'] ?? '') . '.' . ($cond['field'] ?? '$value');
                            $expected[$key] = $val;
                        }
                    }
                }
            }
            if (!empty($block['children'])) {
                $this->collectExpectedFromBlocks($block['children'], $node, $expected);
            }
        }
    }

    public function slugify(string $text): string
    {
        $text = preg_replace('/[^a-z0-9]+/i', '-', $text);
        return strtolower(trim($text, '-'));
    }
}

<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionRule;
use App\Entity\CollectionRuleExtract;
use App\Entity\CollectionRuleFolder;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use Doctrine\ORM\EntityManagerInterface;
use phpseclib3\Net\SSH2;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use App\Message\CollectNodeMessage;

#[AsMessageHandler]
class CollectNodeMessageHandler
{
    private const SSH_TIMEOUT = 30;
    private const READ_TIMEOUT = 30;
    private const PROMPT_REGEX = '/[#>\$\]]\s*$/';
    private const STABLE_WAIT = 2; // seconds to wait for more data after prompt detected

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    public function __invoke(CollectNodeMessage $message): void
    {
        $collection = $this->em->getRepository(Collection::class)->find($message->getCollectionId());
        if (!$collection) {
            return;
        }

        $node = $collection->getNode();
        $model = $node->getModel();

        $serviceName = $_ENV['WORKER_SERVICE_NAME'] ?? 'worker';
        $hostname = gethostname() ?: 'unknown';
        $collection->setWorker($serviceName . '/' . $hostname);
        $collection->setStatus(Collection::STATUS_RUNNING);
        $collection->setStartedAt(new \DateTimeImmutable());
        $this->em->flush();
        $this->publishUpdate($collection);

        $commands = $this->resolveCommands($model);

        if (empty($commands)) {
            $collection->setStatus(Collection::STATUS_COMPLETED);
            $collection->setCommandCount(0);
            $collection->setCompletedCount(0);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
            return;
        }

        $collection->setCommandCount(count($commands));
        $this->em->flush();
        $this->publishUpdate($collection);

        // Base storage directory for this collection
        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();
        if (!is_dir($baseDir)) {
            mkdir($baseDir, 0775, true);
        }

        // Get CLI credentials
        $profile = $node->getProfile();
        $cliCred = $profile?->getCliCredential();

        if (!$cliCred || !$cliCred->getUsername()) {
            $collection->setStatus(Collection::STATUS_FAILED);
            $collection->setError('No CLI credentials configured on this node\'s profile');
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
            return;
        }

        $ip = $node->getIpAddress();
        $port = $cliCred->getPort() ?: 22;

        try {
            $ssh = new SSH2($ip, $port, self::SSH_TIMEOUT);
            $ssh->enablePTY();

            if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) {
                $collection->setStatus(Collection::STATUS_FAILED);
                $collection->setError('SSH authentication failed for ' . $cliCred->getUsername() . '@' . $ip . ':' . $port);
                $collection->setCompletedAt(new \DateTimeImmutable());
                $this->em->flush();
                $this->publishUpdate($collection);
                return;
            }

            $ssh->setTimeout(self::READ_TIMEOUT);

            // Read initial prompt/banner
            $this->readFullResponse($ssh);

            // Execute connection script
            $this->executeConnectionScript($ssh, $model?->getConnectionScript(), $model?->getSendCtrlChar());

            // Execute each collection command (rule)
            $completedCount = 0;
            $hasError = false;

            foreach ($commands as $cmd) {
                $ruleSlug = $cmd->getId() . '_' . $this->slugify($cmd->getName());
                $ruleDir = $baseDir . '/' . $ruleSlug;
                if (!is_dir($ruleDir)) {
                    mkdir($ruleDir, 0775, true);
                }

                try {
                    $cmdLines = array_filter(array_map('trim', explode("\n", $cmd->getCommands())), fn($l) => $l !== '');

                    foreach ($cmdLines as $line) {
                        $lineSlug = $this->slugify($line);
                        $filepath = $ruleDir . '/' . $lineSlug . '.txt';

                        $ssh->write($line . "\n");
                        $response = $this->readFullResponse($ssh);

                        // Remove the echoed command from the beginning of the response
                        $responseLines = explode("\n", $response);
                        if (!empty($responseLines) && str_contains($responseLines[0], trim($line))) {
                            array_shift($responseLines);
                        }
                        // Remove the trailing prompt line
                        if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) {
                            array_pop($responseLines);
                        }

                        file_put_contents($filepath, implode("\n", $responseLines));
                    }

                    $completedCount++;
                } catch (\Throwable $e) {
                    $hasError = true;
                    file_put_contents($ruleDir . '/_error.txt', $e->getMessage());
                }

                $collection->setCompletedCount($completedCount);
                $this->em->flush();
                $this->publishUpdate($collection);
            }

            $ssh->disconnect();

            $collection->setStatus($hasError ? Collection::STATUS_FAILED : Collection::STATUS_COMPLETED);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);

            // Apply collection rules and extract inventory data
            if (!$hasError) {
                $this->processInventoryRules($collection, $node, $baseDir);
            }

        } catch (\Throwable $e) {
            $collection->setStatus(Collection::STATUS_FAILED);
            $collection->setError('SSH error: ' . $e->getMessage());
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
        }
    }

    /**
     * Read the full response from the device, waiting until the output is
     * completely stable (no more data arriving) before returning.
     */
    private function readFullResponse(SSH2 $ssh): string
    {
        $output = '';
        $lastLength = -1;

        // Read until we detect a prompt
        $output = $ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);

        // Wait and check if more data is still coming
        // (some devices send data in chunks even after a prompt-like line)
        $stableStart = microtime(true);
        $prevTimeout = self::READ_TIMEOUT;
        $ssh->setTimeout(self::STABLE_WAIT);

        while (true) {
            $extra = @$ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);
            if ($extra === false || $extra === '') {
                break;
            }
            $output .= $extra;
            $stableStart = microtime(true);

            // Safety: don't loop forever
            if (microtime(true) - $stableStart > self::READ_TIMEOUT) {
                break;
            }
        }

        $ssh->setTimeout($prevTimeout);

        return $output;
    }

    /**
     * Execute the connection script on an SSH session.
     * Supports control characters with ^X notation (e.g. ^Y for Ctrl+Y, ^C for Ctrl+C).
     */
    /**
     * Execute the connection script on an SSH session.
     * If sendCtrlChar is set (A-Z), sends the corresponding control character before the script.
     * Supports control characters with ^X notation (e.g. ^C for Ctrl+C).
     */
    private function executeConnectionScript(SSH2 $ssh, ?string $connectionScript, ?string $sendCtrlChar = null): void
    {
        if ($sendCtrlChar && preg_match('/^[A-Z]$/i', $sendCtrlChar)) {
            $ssh->write(chr(ord(strtoupper($sendCtrlChar)) - 64));
            $this->readFullResponse($ssh);
        }

        if (!$connectionScript) {
            return;
        }

        $scriptLines = array_filter(array_map('trim', explode("\n", $connectionScript)), fn($l) => $l !== '');
        foreach ($scriptLines as $line) {
            // Detect control character notation: ^A through ^Z
            if (preg_match('/^\^([A-Za-z])$/', $line, $m)) {
                $char = strtoupper($m[1]);
                $controlChar = chr(ord($char) - 64);
                $ssh->write($controlChar);
            } else {
                $ssh->write($line . "\n");
            }
            $this->readFullResponse($ssh);
        }
    }

    private function resolveCommands($model): array
    {
        if (!$model) {
            return [];
        }

        $commands = [];
        $seenIds = [];

        $manFolder = $this->em->getRepository(CollectionFolder::class)->findOneBy([
            'manufacturer' => $model->getManufacturer(),
            'model' => null,
            'type' => CollectionFolder::TYPE_MANUFACTURER,
        ]);
        if ($manFolder) {
            $this->collectCommandsFromFolder($manFolder, $commands, $seenIds, true);
        }

        $modelFolder = $this->em->getRepository(CollectionFolder::class)->findOneBy([
            'model' => $model,
            'type' => CollectionFolder::TYPE_MODEL,
        ]);
        if ($modelFolder) {
            $this->collectCommandsFromFolder($modelFolder, $commands, $seenIds);
        }

        foreach ($model->getManualCommands() as $c) {
            if ($c->isEnabled() && !in_array($c->getId(), $seenIds, true)) {
                $commands[] = $c;
                $seenIds[] = $c->getId();
            }
        }

        return $commands;
    }

    private function collectCommandsFromFolder(CollectionFolder $folder, array &$commands, array &$seenIds, bool $skipModelFolders = false): void
    {
        foreach ($this->em->getRepository(CollectionCommand::class)->findBy(['folder' => $folder, 'enabled' => true], ['name' => 'ASC']) as $c) {
            if (!in_array($c->getId(), $seenIds, true)) {
                $commands[] = $c;
                $seenIds[] = $c->getId();
            }
        }
        $children = $this->em->getRepository(CollectionFolder::class)->findBy(['parent' => $folder], ['name' => 'ASC']);
        foreach ($children as $child) {
            if ($skipModelFolders && $child->getType() === CollectionFolder::TYPE_MODEL) continue;
            $this->collectCommandsFromFolder($child, $commands, $seenIds, $skipModelFolders);
        }
    }

    private function publishUpdate(Collection $collection): void
    {
        $node = $collection->getNode();
        $context = $collection->getContext();

        $this->hub->publish(new Update(
            'collections/node/' . $node->getId(),
            json_encode([
                'event' => 'collection.updated',
                'collection' => [
                    'id' => $collection->getId(),
                    'nodeId' => $node->getId(),
                    'status' => $collection->getStatus(),
                    'tags' => $collection->getTags(),
                    'commandCount' => $collection->getCommandCount(),
                    'completedCount' => $collection->getCompletedCount(),
                    'worker' => $collection->getWorker(),
                    'error' => $collection->getError(),
                    'startedAt' => $collection->getStartedAt()?->format('c'),
                    'completedAt' => $collection->getCompletedAt()?->format('c'),
                ],
            ]),
        ));

        $this->hub->publish(new Update(
            'admin/tasks',
            json_encode([
                'event' => 'task.updated',
                'task' => [
                    'id' => 'col-' . $collection->getId(),
                    'type' => 'collection',
                    'status' => $collection->getStatus(),
                    'worker' => $collection->getWorker(),
                    'output' => $collection->getError(),
                    'node' => [
                        'id' => $node->getId(),
                        'ipAddress' => $node->getIpAddress(),
                        'name' => $node->getName(),
                    ],
                    'context' => $context ? [
                        'id' => $context->getId(),
                        'name' => $context->getName(),
                    ] : null,
                    'startedAt' => $collection->getStartedAt()?->format('c'),
                    'completedAt' => $collection->getCompletedAt()?->format('c'),
                    'createdAt' => $collection->getCreatedAt()->format('c'),
                ],
            ]),
        ));
    }

    public function processInventoryRules(Collection $collection, Node $node, string $baseDir): void
    {
        $model = $node->getModel();
        $rules = $this->resolveRules($model);

        if (empty($rules)) {
            return;
        }

        // Delete existing inventory for this node (full refresh)
        $this->em->createQueryBuilder()
            ->delete(NodeInventoryEntry::class, 'e')
            ->where('e.node = :node')
            ->setParameter('node', $node)
            ->getQuery()
            ->execute();

        $nodeFieldUpdates = [];

        foreach ($rules as $rule) {
            // Get file content for this rule
            $text = $this->getRuleOutput($rule, $baseDir, $collection, $node);
            if (!$text) {
                continue;
            }

            /** @var CollectionRuleExtract[] $extracts */
            $extracts = $rule->getExtracts()->toArray();

            foreach ($extracts as $ext) {
                $this->applyExtract($ext, $text, $node, $rule, $collection);

                // If this extract maps to a node field (only non-multiline)
                if (!$ext->isMultiline() && $ext->getNodeField()) {
                    $value = $this->extractNodeFieldValue($ext, $text);
                    if ($value !== null) {
                        $value = $this->applyTranslation($rule, $ext, $value);
                        $nodeFieldUpdates[$ext->getNodeField()] = $value;
                    }
                }
            }
        }

        // Apply node field updates
        foreach ($nodeFieldUpdates as $field => $value) {
            match ($field) {
                'hostname' => $node->setHostname($value),
                'discoveredModel' => $node->setDiscoveredModel($value),
                'discoveredVersion' => $node->setDiscoveredVersion($value),
                'productModel' => $node->setProductModel($value),
                default => null,
            };
        }

        $this->em->flush();
    }

    private function getRuleOutput(CollectionRule $rule, string $baseDir, Collection $collection, Node $node): ?string
    {
        if ($rule->getSource() === CollectionRule::SOURCE_LOCAL) {
            $tag = $rule->getTag();
            $command = $rule->getCommand();

            // If this rule has a tag, find the latest tagged collection for this node
            if ($tag) {
                $conn = $this->em->getConnection();
                $sql = 'SELECT id FROM collection WHERE node_id = :node AND status = :status AND tags::text LIKE :tag ORDER BY completed_at DESC LIMIT 1';
                $row = $conn->fetchAssociative($sql, [
                    'node' => $node->getId(),
                    'status' => Collection::STATUS_COMPLETED,
                    'tag' => '%"' . $tag . '"%',
                ]);
                $taggedCollection = $row ? $this->em->getRepository(Collection::class)->find($row['id']) : null;
                if ($taggedCollection) {
                    $storageDir = $this->projectDir . '/var/' . $taggedCollection->getStoragePath();
                } else {
                    return null;
                }
            } else {
                $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();
            }

            if (!is_dir($storageDir)) {
                return null;
            }

            // If a command is specified, look for the matching file first
            if ($command) {
                $commandSlug = $this->slugify($command);
                $dirs = @scandir($storageDir);
                if ($dirs !== false) {
                    foreach ($dirs as $dir) {
                        if ($dir === '.' || $dir === '..') continue;
                        $filePath = $storageDir . '/' . $dir . '/' . $commandSlug . '.txt';
                        if (file_exists($filePath)) {
                            $content = file_get_contents($filePath);
                            if ($content !== false) {
                                return $content;
                            }
                        }
                    }
                }
            }

            // Fallback: read all files
            $allContent = [];
            $dirs = @scandir($storageDir);
            if ($dirs === false) return null;

            foreach ($dirs as $dir) {
                if ($dir === '.' || $dir === '..') continue;
                $ruleDir = $storageDir . '/' . $dir;
                if (!is_dir($ruleDir)) continue;
                $files = @scandir($ruleDir);
                if ($files === false) continue;
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..' || $file === '_error.txt') continue;
                    $filepath = $ruleDir . '/' . $file;
                    if (is_file($filepath)) {
                        $content = file_get_contents($filepath);
                        if ($content !== false) {
                            $allContent[] = $content;
                        }
                    }
                }
            }

            return !empty($allContent) ? implode("\n", $allContent) : null;
        }

        if ($rule->getSource() === CollectionRule::SOURCE_SSH && $rule->getCommand()) {
            // For SSH rules, execute the command live
            $profile = $node->getProfile();
            $cliCred = $profile?->getCliCredential();
            if (!$cliCred || !$cliCred->getUsername()) return null;

            try {
                $ssh = new SSH2($node->getIpAddress(), $cliCred->getPort() ?: 22, self::SSH_TIMEOUT);
                $ssh->enablePTY();
                if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) return null;
                $ssh->setTimeout(self::READ_TIMEOUT);
                $this->readFullResponse($ssh);

                $this->executeConnectionScript($ssh, $node->getModel()?->getConnectionScript(), $node->getModel()?->getSendCtrlChar());

                $ssh->write($rule->getCommand() . "\n");
                $response = $this->readFullResponse($ssh);
                $ssh->disconnect();

                $responseLines = explode("\n", $response);
                if (!empty($responseLines) && str_contains($responseLines[0], trim($rule->getCommand()))) {
                    array_shift($responseLines);
                }
                if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) {
                    array_pop($responseLines);
                }

                return implode("\n", $responseLines);
            } catch (\Throwable) {
                return null;
            }
        }

        return null;
    }

    private function applyExtract(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, Collection $collection): void
    {
        $regex = $ext->getRegex();
        if (!$regex) return;

        if ($ext->getExtractMode() === CollectionRuleExtract::EXTRACT_MODE_BLOCK) {
            $this->applyBlockExtract($ext, $text, $node, $rule, $collection);
            return;
        }

        // --- Line mode (default, unchanged) ---
        $this->applyExtractOnText($ext, $text, $node, $rule, $collection, null);
    }

    /**
     * Block mode: split the text into blocks using blockSeparator, then apply
     * the normal line-by-line extraction within each block individually.
     */
    private function applyBlockExtract(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, Collection $collection): void
    {
        $separator = $ext->getBlockSeparator();
        if (!$separator) return;

        $separatorRegex = '/' . $separator . '/m';
        if (@preg_match_all($separatorRegex, $text, $matches, PREG_OFFSET_CAPTURE) === false || empty($matches[0])) {
            return;
        }

        $positions = array_map(fn($m) => (int) $m[1], $matches[0]);
        $blockKeyGroup = $ext->getBlockKeyGroup();

        for ($i = 0, $n = count($positions); $i < $n; $i++) {
            $start = $positions[$i];
            $end = $positions[$i + 1] ?? strlen($text);
            $blockText = substr($text, $start, $end - $start);

            // Extract the block key from the separator's capture group (if configured)
            $blockKey = null;
            if ($blockKeyGroup !== null && isset($matches[$blockKeyGroup][$i])) {
                $blockKey = trim((string) $matches[$blockKeyGroup][$i][0]);
            }

            $this->applyExtractOnText($ext, $blockText, $node, $rule, $collection, $blockKey);
        }
    }

    /**
     * Apply extraction regex on a text fragment (either the full output in line
     * mode, or a single block in block mode). If $blockKey is provided, it
     * overrides the normal key resolution for all entries created.
     */
    private function applyExtractOnText(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, Collection $collection, ?string $blockKey): void
    {
        $regex = $ext->getRegex();
        $hasValueMap = $ext->getValueMap() && count($ext->getValueMap()) > 0;
        $categoryName = $ext->getCategory() ? $ext->getCategory()->getName() : 'Uncategorized';

        $lines = explode("\n", $text);

        foreach ($lines as $rawLine) {
            $line = rtrim($rawLine, "\r");
            if (!preg_match('/' . $regex . '/', $line, $m)) {
                continue;
            }

            // Resolve key: blockKey takes priority if provided
            $key = null;
            if ($blockKey !== null && $blockKey !== '') {
                $key = $blockKey;
                // Still support template variables: $1, $2 from the current regex match
                if (preg_match('/\$\d/', $key)) {
                    $key = preg_replace_callback('/\$(\d+)/', fn($r) => $m[(int)$r[1]] ?? '', $key);
                }
            } elseif ($ext->getKeyMode() === CollectionRuleExtract::KEY_MODE_EXTRACT && $ext->getKeyGroup()) {
                $kg = $ext->getKeyGroup();
                $key = $m[$kg] ?? null;
            } else {
                $key = $ext->getKeyManual() ?: $ext->getName();
                if ($key && preg_match('/\$\d/', $key)) {
                    $key = preg_replace_callback('/\$(\d+)/', fn($r) => $m[(int)$r[1]] ?? '', $key);
                }
            }
            if ($key === null || $key === '') continue;

            // Resolve values
            if ($hasValueMap) {
                $seenLabels = [];
                foreach ($ext->getValueMap() as $vm) {
                    $label = $vm['label'] ?? 'Value';
                    $group = $vm['group'] ?? 1;
                    $value = $m[$group] ?? '';
                    $value = $this->applyTranslation($rule, $ext, $value);

                    // Deduplicate labels within the same value_map
                    if (isset($seenLabels[$label])) {
                        $seenLabels[$label]->setValue($value);
                        continue;
                    }

                    $entry = new NodeInventoryEntry();
                    $entry->setNode($node);
                    $entry->setCategory($ext->getCategory());
                    $entry->setCategoryName($categoryName);
                    $entry->setEntryKey($key);
                    $entry->setColLabel($label);
                    $entry->setValue($value);
                    $entry->setRule($rule);
                    $entry->setCollection($collection);
                    $entry->setUpdatedAt(new \DateTimeImmutable());
                    $this->em->persist($entry);
                    $seenLabels[$label] = $entry;
                }
            } else {
                $vg = $ext->getKeyMode() === CollectionRuleExtract::KEY_MODE_EXTRACT
                    ? ($ext->getValueGroup() ?? 2)
                    : ($ext->getValueGroup() ?? 1);
                $value = $m[$vg] ?? $m[1] ?? $m[0] ?? '';
                $value = $this->applyTranslation($rule, $ext, $value);

                $entry = new NodeInventoryEntry();
                $entry->setNode($node);
                $entry->setCategory($ext->getCategory());
                $entry->setCategoryName($categoryName);
                $entry->setEntryKey($key);
                $entry->setColLabel('Value#1');
                $entry->setValue($value);
                $entry->setRule($rule);
                $entry->setCollection($collection);
                $entry->setUpdatedAt(new \DateTimeImmutable());
                $this->em->persist($entry);
            }
        }
    }

    private function extractNodeFieldValue(CollectionRuleExtract $ext, string $text): ?string
    {
        $regex = $ext->getRegex();
        $group = $ext->getNodeFieldGroup() ?? 1;
        $lines = explode("\n", $text);

        foreach ($lines as $rawLine) {
            $line = rtrim($rawLine, "\r");
            if (preg_match('/' . $regex . '/', $line, $m)) {
                return $m[$group] ?? null;
            }
        }

        return null;
    }

    /**
     * Apply translations defined on the rule to transform an extracted value.
     */
    private function applyTranslation(CollectionRule $rule, CollectionRuleExtract $ext, string $value): string
    {
        $translations = $rule->getTranslations();
        if (!$translations) return $value;

        // Find translation entry for this extract
        $translation = null;
        foreach ($translations as $t) {
            if (($t['extractId'] ?? null) === $ext->getId()) {
                $translation = $t;
                break;
            }
        }
        if (!$translation || empty($translation['conditionTree']['blocks'])) return $value;

        // Evaluate condition tree blocks (if / else-if / else)
        $result = $this->evaluateTranslationBlocks($translation['conditionTree']['blocks'], $value);

        return $result ?? $value;
    }

    private function evaluateTranslationBlocks(array $blocks, string $value): ?string
    {
        foreach ($blocks as $block) {
            $type = $block['type'] ?? 'if';

            if ($type === 'else') {
                $resultValue = $block['result']['value'] ?? null;
                return $resultValue ?? $value;
            }

            // Evaluate conditions
            $logic = $block['logic'] ?? 'and';
            $conditions = $block['conditions'] ?? [];
            $matched = $this->evaluateTranslationConditions($conditions, $value, $logic);

            if ($matched) {
                // Check for nested children
                if (!empty($block['children'])) {
                    return $this->evaluateTranslationBlocks($block['children'], $value);
                }
                $resultValue = $block['result']['value'] ?? null;
                return $resultValue ?? $value;
            }
        }

        return null; // No block matched
    }

    private function evaluateTranslationConditions(array $conditions, string $value, string $logic): bool
    {
        if (empty($conditions)) return true;

        foreach ($conditions as $cond) {
            $operator = $cond['operator'] ?? 'equals';
            $compareValue = $cond['value'] ?? '';
            $result = $this->compareTranslationValue($value, $operator, $compareValue);

            if ($logic === 'or' && $result) return true;
            if ($logic === 'and' && !$result) return false;
        }

        return $logic === 'and';
    }

    private function compareTranslationValue(string $value, string $operator, ?string $compareValue): bool
    {
        return match ($operator) {
            'equals' => $value === ($compareValue ?? ''),
            'not_equals' => $value !== ($compareValue ?? ''),
            'contains' => str_contains($value, $compareValue ?? ''),
            'not_contains' => !str_contains($value, $compareValue ?? ''),
            'matches' => (bool) @preg_match('/' . ($compareValue ?? '') . '/', $value),
            'greater_than' => (float) $value > (float) ($compareValue ?? '0'),
            'less_than' => (float) $value < (float) ($compareValue ?? '0'),
            'exists' => $value !== '',
            'not_exists' => $value === '',
            'is_empty' => $value === '',
            'is_not_empty' => $value !== '',
            default => false,
        };
    }

    private function resolveRules($model): array
    {
        if (!$model) {
            return [];
        }

        $rules = [];
        $seenIds = [];

        // Manufacturer folder rules (recursive)
        $manFolder = $this->em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'manufacturer' => $model->getManufacturer(),
            'model' => null,
            'type' => CollectionRuleFolder::TYPE_MANUFACTURER,
        ]);
        if ($manFolder) {
            $this->collectRulesFromFolder($manFolder, $rules, $seenIds, true);
        }

        // Model folder rules (recursive)
        $modelFolder = $this->em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'model' => $model,
            'type' => CollectionRuleFolder::TYPE_MODEL,
        ]);
        if ($modelFolder) {
            $this->collectRulesFromFolder($modelFolder, $rules, $seenIds);
        }

        // Manual rules
        foreach ($model->getManualRules() as $r) {
            if ($r->isEnabled() && !in_array($r->getId(), $seenIds, true) && !empty($r->getExtracts()->toArray())) {
                $rules[] = $r;
                $seenIds[] = $r->getId();
            }
        }

        return $rules;
    }

    private function slugify(string $text): string
    {
        $text = preg_replace('/[^a-z0-9]+/i', '-', $text);
        return strtolower(trim($text, '-'));
    }

    private function collectRulesFromFolder(CollectionRuleFolder $folder, array &$rules, array &$seenIds, bool $skipModelFolders = false): void
    {
        foreach ($this->em->getRepository(CollectionRule::class)->findBy(['folder' => $folder, 'enabled' => true]) as $r) {
            if (!in_array($r->getId(), $seenIds, true) && !empty($r->getExtracts()->toArray())) {
                $rules[] = $r;
                $seenIds[] = $r->getId();
            }
        }
        $children = $this->em->getRepository(CollectionRuleFolder::class)->findBy(['parent' => $folder], ['name' => 'ASC']);
        foreach ($children as $child) {
            if ($skipModelFolders && $child->getType() === CollectionRuleFolder::TYPE_MODEL) continue;
            $this->collectRulesFromFolder($child, $rules, $seenIds, $skipModelFolders);
        }
    }
}

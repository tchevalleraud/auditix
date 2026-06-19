<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionRule;
use App\Entity\CollectionRuleExtract;
use App\Entity\CollectionRuleFolder;
use App\Entity\CollectionTag;
use App\Doctrine\Filter\LatestInventoryFilter;
use App\Entity\InventoryCategory;
use App\Entity\Node;
use App\Entity\NodeDynamicTag;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Message\EvaluateComplianceMessage;
use App\Message\RecalculateNodeScoreMessage;
use App\Service\ConditionTreeEvaluator;
use App\Service\PolicyAutoAssigner;
use Doctrine\ORM\EntityManagerInterface;
use phpseclib3\Net\SSH2;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;
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
        private readonly ConditionTreeEvaluator $conditionTree,
        private readonly MessageBusInterface $bus,
        private readonly PolicyAutoAssigner $policyAutoAssigner,
        private readonly LoggerInterface $logger,
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

        $this->logger->info('[collect] start', [
            'collectionId' => $collection->getId(),
            'nodeId' => $node->getId(),
            'ip' => $node->getIpAddress(),
            'model' => $model?->getName(),
        ]);

        $commands = $this->resolveCommands($model);

        if (empty($commands)) {
            $collection->setStatus(Collection::STATUS_COMPLETED);
            $collection->setCommandCount(0);
            $collection->setCompletedCount(0);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            // No commands at all is treated as success — apply the pending
            // tag swap so the empty collect still becomes the new "latest".
            $this->applyPendingTagSwap($collection);
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
            $this->rollbackFailedCollection(
                $collection,
                'No CLI credentials configured on this node\'s profile',
            );
            return;
        }

        $ip = $node->getIpAddress();
        $port = $cliCred->getPort() ?: 22;

        try {
            $ssh = new SSH2($ip, $port, self::SSH_TIMEOUT);
            $ssh->enablePTY();

            if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) {
                $this->rollbackFailedCollection(
                    $collection,
                    'SSH authentication failed for ' . $cliCred->getUsername() . '@' . $ip . ':' . $port,
                );
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

                        $this->logger->info('[collect] cmd start', [
                            'collectionId' => $collection->getId(),
                            'nodeId' => $node->getId(),
                            'ip' => $ip,
                            'cmd' => $line,
                            'cmdName' => $cmd->getName(),
                        ]);
                        $cmdT0 = microtime(true);
                        $ssh->write($line . "\n");
                        $response = $this->readFullResponse($ssh);
                        $this->logger->info('[collect] cmd done', [
                            'collectionId' => $collection->getId(),
                            'nodeId' => $node->getId(),
                            'ip' => $ip,
                            'cmd' => $line,
                            'durationMs' => (int) ((microtime(true) - $cmdT0) * 1000),
                            'bytes' => strlen($response),
                        ]);

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

            $this->logger->info('[collect] done', [
                'collectionId' => $collection->getId(),
                'nodeId' => $node->getId(),
                'ip' => $ip,
                'commandsTotal' => count($commands),
                'commandsCompleted' => $completedCount,
                'hasError' => $hasError,
            ]);

            if ($hasError) {
                // Rollback: drop the failed collection so the prior collection
                // keeps its tag and inventory. Stop the pipeline here.
                $this->rollbackFailedCollection(
                    $collection,
                    'One or more collect commands failed',
                );
                return;
            }

            $collection->setStatus(Collection::STATUS_COMPLETED);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();

            // Swap tags now that the collect succeeded. Releasing the prior tag
            // CASCADE-deletes its inventory entries so the next extraction can
            // populate this collection's snapshot.
            $this->applyPendingTagSwap($collection);
            $this->publishUpdate($collection);

            // Apply collection rules and extract inventory data
            $collection->setExtractStatus(Collection::EXTRACT_STATUS_RUNNING);
            $this->em->flush();
            $extractOk = false;
            try {
                $this->processInventoryRules($collection, $node, $baseDir);
                $collection->setExtractStatus(Collection::EXTRACT_STATUS_COMPLETED);
                $collection->setLastExtractedAt(new \DateTimeImmutable());
                $extractOk = true;
            } catch (\Throwable $e) {
                $collection->setExtractStatus(Collection::EXTRACT_STATUS_FAILED);
                $collection->setExtractError($e->getMessage());
            }
            $this->em->flush();

            if ($extractOk) {
                $this->publishNodeUpdated($node);
            }

            if ($extractOk && $message->shouldChainCompliance()) {
                $this->dispatchComplianceForNode($node);
            }

        } catch (\Throwable $e) {
            $this->rollbackFailedCollection($collection, 'SSH error: ' . $e->getMessage());
        }
    }

    /**
     * Apply the deferred tag swap after a successful collect: release the same
     * tag from any prior collection on the node (CASCADE-deletes its inventory)
     * and bind it to this collection. Idempotent — clears pendingTags after.
     */
    private function applyPendingTagSwap(Collection $collection): void
    {
        $pending = $collection->getPendingTags();
        if (empty($pending)) {
            return;
        }

        $node = $collection->getNode();
        foreach ($pending as $name) {
            // Release this tag from any other collection of the same node.
            $this->em->createQueryBuilder()
                ->delete(CollectionTag::class, 'ct')
                ->where('ct.node = :node AND ct.name = :name AND ct.collection != :self')
                ->setParameter('node', $node)
                ->setParameter('name', $name)
                ->setParameter('self', $collection)
                ->getQuery()
                ->execute();

            if (!$collection->hasTag($name)) {
                $collection->addTag($name);
            }
        }
        $collection->clearPendingTags();
        $this->em->flush();
    }

    /**
     * Discard a collection that failed before completion: delete the row, its
     * SSH output storage, and notify subscribers. The prior collection on the
     * same node keeps its tag and inventory intact.
     */
    private function rollbackFailedCollection(Collection $collection, string $reason): void
    {
        $node = $collection->getNode();
        $context = $collection->getContext();
        $collectionId = $collection->getId();

        $this->logger->warning('[collect] rollback', [
            'collectionId' => $collectionId,
            'nodeId' => $node?->getId(),
            'reason' => $reason,
        ]);

        $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();
        $this->deleteDirectory($storageDir);

        $this->em->remove($collection);
        $this->em->flush();

        $this->publishCollectionDeleted($collectionId, $node, $context, $reason);
    }

    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) return;
        $items = scandir($dir);
        if ($items === false) return;
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }

    private function publishCollectionDeleted(?int $id, ?Node $node, $context, string $reason): void
    {
        if (!$id || !$node) return;

        $this->hub->publish(new Update(
            'collections/node/' . $node->getId(),
            json_encode([
                'event' => 'collection.deleted',
                'collection' => [
                    'id' => $id,
                    'nodeId' => $node->getId(),
                    'reason' => $reason,
                ],
            ]),
        ));

        $this->hub->publish(new Update(
            'admin/tasks',
            json_encode([
                'event' => 'task.deleted',
                'task' => [
                    'id' => 'col-' . $id,
                    'type' => 'collection',
                    'reason' => $reason,
                    'node' => [
                        'id' => $node->getId(),
                        'ipAddress' => $node->getIpAddress(),
                        'name' => $node->getName(),
                    ],
                    'context' => $context ? [
                        'id' => $context->getId(),
                        'name' => $context->getName(),
                    ] : null,
                ],
            ]),
        ));
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

    public function publishNodeUpdated(Node $node): void
    {
        $context = $node->getContext();
        if (!$context) {
            return;
        }

        $tags = [];
        foreach ($node->getTags() as $t) {
            $tags[] = ['id' => $t->getId(), 'name' => $t->getName(), 'color' => $t->getColor()];
        }

        $dynamicTags = [];
        $dynRows = $this->em->getRepository(NodeDynamicTag::class)->findBy(['node' => $node]);
        foreach ($dynRows as $d) {
            $dynamicTags[] = [
                'id' => $d->getTag()->getId(),
                'name' => $d->getTag()->getName(),
                'color' => $d->getTag()->getColor(),
                'ruleId' => $d->getRule()?->getId(),
                'ruleName' => $d->getRule()?->getName(),
            ];
        }

        $this->hub->publish(new Update(
            'nodes/context/' . $context->getId(),
            json_encode([
                'event' => 'node.updated',
                'nodeId' => $node->getId(),
                'hostname' => $node->getHostname(),
                'discoveredModel' => $node->getDiscoveredModel(),
                'discoveredVersion' => $node->getDiscoveredVersion(),
                'productModel' => $node->getProductModel(),
                'tags' => $tags,
                'dynamicTags' => $dynamicTags,
            ]),
        ));
    }

    public function dispatchComplianceForNode(Node $node): void
    {
        $policies = $this->policyAutoAssigner->autoAssign($node);

        if (empty($policies)) {
            $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
            return;
        }

        $node->setScore(null);
        $node->setComplianceEvaluating('pending');
        $this->em->flush();

        foreach ($policies as $policy) {
            $this->bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
        }
    }

    public function processInventoryRules(Collection $collection, Node $node, string $baseDir, ?string $tagName = null): void
    {
        $model = $node->getModel();
        $rules = $this->resolveRules($model);

        if (empty($rules)) {
            return;
        }

        // Resolve which tags to process for this collection.
        $tags = [];
        if ($tagName !== null) {
            $t = $collection->getCollectionTag($tagName);
            if ($t) $tags[] = $t;
        } else {
            foreach ($collection->getCollectionTags() as $t) {
                $tags[] = $t;
            }
        }

        if (empty($tags)) {
            return;
        }

        $this->logger->info('[extract] start', [
            'collectionId' => $collection->getId(),
            'nodeId' => $node->getId(),
            'ip' => $node->getIpAddress(),
            'rulesTotal' => count($rules),
            'tags' => array_map(fn(CollectionTag $t) => $t->getName(), $tags),
        ]);

        // The latest_inventory filter scopes reads to the "latest" tag — disable
        // it so per-tag DELETEs and historical-tag INSERTs work as expected.
        $filters = $this->em->getFilters();
        $filterWasEnabled = $filters->isEnabled(LatestInventoryFilter::NAME);
        if ($filterWasEnabled) $filters->disable(LatestInventoryFilter::NAME);

        try {
            foreach ($tags as $tag) {
                $this->extractInventoryForTag($collection, $node, $baseDir, $rules, $tag);
            }
        } finally {
            if ($filterWasEnabled) $filters->enable(LatestInventoryFilter::NAME);
        }
    }

    /**
     * Extract inventory entries scoped to a single CollectionTag.
     * Node-level fields (hostname, discoveredModel, …) and dynamic tags are only
     * updated when the tag is "latest" — historical snapshots stay isolated.
     */
    private function extractInventoryForTag(Collection $collection, Node $node, string $baseDir, array $rules, CollectionTag $tag): void
    {
        $isLatest = $tag->getName() === 'latest';

        // Delete previous inventory entries bound to this tag (per-tag refresh).
        $this->em->createQueryBuilder()
            ->delete(NodeInventoryEntry::class, 'e')
            ->where('e.collectionTag = :tag')
            ->setParameter('tag', $tag)
            ->getQuery()
            ->execute();

        if ($isLatest) {
            // Dynamic tags are computed from the latest snapshot only.
            $this->em->createQueryBuilder()
                ->delete(NodeDynamicTag::class, 'd')
                ->where('d.node = :node')
                ->setParameter('node', $node)
                ->getQuery()
                ->execute();
        }

        // Reset dedup index for this tag's extraction pass.
        $this->entryIndex = [];

        $nodeFieldUpdates = [];

        foreach ($rules as $rule) {
            $text = $this->getRuleOutput($rule, $baseDir, $collection, $node);
            if (!$text) {
                continue;
            }

            /** @var CollectionRuleExtract[] $extracts */
            $extracts = $rule->getExtracts()->toArray();

            foreach ($extracts as $ext) {
                $this->applyExtract($ext, $text, $node, $rule, $tag);

                if ($isLatest && !$ext->isMultiline() && $ext->getNodeField()) {
                    $value = $this->extractNodeFieldValue($ext, $text);
                    if ($value !== null) {
                        $value = $this->applyTranslation($rule, $ext, $value);
                        $nodeFieldUpdates[$ext->getNodeField()] = $value;
                    }
                }
            }
        }

        if ($isLatest) {
            foreach ($nodeFieldUpdates as $field => $value) {
                match ($field) {
                    'hostname' => $node->setHostname($value),
                    'discoveredModel' => $node->setDiscoveredModel($value),
                    'discoveredVersion' => $node->setDiscoveredVersion($value),
                    'productModel' => $node->setProductModel($value),
                    default => null,
                };
            }
        }

        $this->em->flush();

        if ($isLatest) {
            $this->applyConditionTrees($rules, $node, $tag);
            $this->em->flush();
        }
    }

    /**
     * Phase 2: evaluate each rule's conditionTree and apply results
     * (set_tag → NodeDynamicTag, set_inventory → NodeInventoryEntry).
     * Tags are deduplicated against manual tags + already-applied dynamic tags.
     *
     * Blocks are processed in document order, so their UI position is meaningful:
     *   - "always": no condition, actions applied unconditionally when reached.
     *   - "foreach": iterate every row of a category when reached.
     *   - "if" / "else_if" / "else": a contiguous run forms one cascade; the
     *     first matching block in the run wins. An "else" terminates its run, so
     *     a conditional that follows it (or follows an always/foreach) begins a
     *     new cascade. This lets an "always" sit before, between or after the
     *     conditionals and have a well-defined effect on what they read.
     */
    private function applyConditionTrees(array $rules, Node $node, CollectionTag $tag): void
    {
        $manualTagIds = [];
        foreach ($node->getTags() as $t) {
            $manualTagIds[$t->getId()] = true;
        }
        $appliedDynamicTagIds = [];

        foreach ($rules as $rule) {
            /** @var CollectionRule $rule */
            $tree = $rule->getConditionTree();
            $blocks = is_array($tree) ? ($tree['blocks'] ?? []) : [];
            if (empty($blocks)) {
                continue;
            }

            $n = count($blocks);
            $i = 0;
            while ($i < $n) {
                $b = $blocks[$i];
                if (!is_array($b)) { $i++; continue; }
                $type = $b['type'] ?? 'if';

                if ($type === 'always') {
                    $res = $b['result'] ?? [];
                    foreach ((isset($res['type']) ? [$res] : (is_array($res) ? $res : [])) as $a) {
                        if (is_array($a)) $this->applyAction($a, $node, $rule, $tag, $manualTagIds, $appliedDynamicTagIds);
                    }
                    $i++;
                } elseif ($type === 'foreach') {
                    $this->applyForeachBlock($b, $node, $rule, $tag, $manualTagIds, $appliedDynamicTagIds);
                    $i++;
                } else {
                    // Gather a contiguous if/else_if/else cascade. An "else"
                    // ends the run; a following conditional starts a new one.
                    $run = [$b];
                    $i++;
                    while ($i < $n && is_array($blocks[$i])) {
                        $t = $blocks[$i]['type'] ?? 'if';
                        $prev = $run[count($run) - 1]['type'] ?? 'if';
                        if (($t === 'else_if' || $t === 'else') && ($prev === 'if' || $prev === 'else_if')) {
                            $run[] = $blocks[$i];
                            $i++;
                        } else {
                            break;
                        }
                    }
                    $result = $this->conditionTree->evaluateBlocks($run, [], $node);
                    if (is_array($result)) {
                        foreach ((isset($result['type']) ? [$result] : $result) as $a) {
                            if (is_array($a)) $this->applyAction($a, $node, $rule, $tag, $manualTagIds, $appliedDynamicTagIds);
                        }
                    }
                }
            }
        }
    }

    /**
     * Apply a single non-foreach action (set_tag / set_inventory / count).
     */
    private function applyAction(array $action, Node $node, CollectionRule $rule, CollectionTag $tag, array &$manualTagIds, array &$appliedDynamicTagIds): void
    {
        $type = $action['type'] ?? null;
        if ($type === 'set_tag') {
            $this->applySetTagAction((int) ($action['tagId'] ?? 0), $node, $rule, $manualTagIds, $appliedDynamicTagIds);
        } elseif ($type === 'set_inventory') {
            $this->applySetInventoryAction($action, (string) ($action['value'] ?? ''), $node, $rule, $tag);
        } elseif ($type === 'count') {
            // Count inventory rows satisfying the per-row match conditions, then
            // write the total to an inventory cell or use it to gate a tag.
            $count = $this->conditionTree->countRows(
                isset($action['matchCategoryId']) ? (int) $action['matchCategoryId'] : null,
                $this->buildCountConditions($action),
                (string) ($action['matchLogic'] ?? 'and'),
                $node,
                (string) ($action['matchTag'] ?? 'latest'),
            );

            if ((string) ($action['target'] ?? 'inventory') === 'tag') {
                $threshold = $this->conditionTree->compareValue(
                    (string) $count,
                    (string) ($action['tagOperator'] ?? 'greater_than'),
                    $action['tagValue'] ?? '0',
                );
                if ($threshold) {
                    $this->applySetTagAction((int) ($action['tagId'] ?? 0), $node, $rule, $manualTagIds, $appliedDynamicTagIds);
                }
            } else {
                $this->applySetInventoryAction($action, (string) $count, $node, $rule, $tag);
            }
        }
    }

    /**
     * Normalize a `count` action's match criterion into a list of `row`
     * conditions. Prefers the multi-condition `matchConditions` list; falls back
     * to the legacy single matchColumn/matchOperator/matchValue triple.
     */
    private function buildCountConditions(array $action): array
    {
        $conditions = [];
        if (!empty($action['matchConditions']) && is_array($action['matchConditions'])) {
            foreach ($action['matchConditions'] as $mc) {
                if (!is_array($mc)) continue;
                $conditions[] = [
                    'type' => 'row',
                    'column' => isset($mc['column']) && $mc['column'] !== '' ? (string) $mc['column'] : 'Value#1',
                    'operator' => (string) ($mc['operator'] ?? 'equals'),
                    'value' => $mc['value'] ?? null,
                ];
            }
        }
        if (empty($conditions)) {
            $conditions[] = [
                'type' => 'row',
                'column' => isset($action['matchColumn']) && $action['matchColumn'] !== '' ? (string) $action['matchColumn'] : 'Value#1',
                'operator' => (string) ($action['matchOperator'] ?? 'equals'),
                'value' => $action['matchValue'] ?? null,
            ];
        }
        return $conditions;
    }

    /**
     * Iterate every row of the foreach category, evaluate the per-row cascade
     * (IF/ELSEIF/ELSE with `row` conditions) and apply the matched actions.
     * `increment` actions accumulate into counters flushed after the loop;
     * `set_inventory` defaults its key to the current row key when left blank.
     */
    private function applyForeachBlock(array $fb, Node $node, CollectionRule $rule, CollectionTag $tag, array &$manualTagIds, array &$appliedDynamicTagIds): void
    {
        $catId = isset($fb['inventoryCategoryId']) ? (int) $fb['inventoryCategoryId'] : 0;
        $children = $fb['children'] ?? [];
        if (!$catId || !is_array($children) || empty($children)) return;

        $rows = $this->conditionTree->getInventoryRows($catId, $node, (string) ($fb['inventoryTag'] ?? 'latest'));

        // Pre-seed increment counters to 0 so "0 matches" still writes a value.
        $counters = [];
        $this->seedIncrementCounters($children, $counters);

        foreach ($rows as $rowKey => $cols) {
            $fields = [];
            foreach ($cols as $c => $v) {
                $fields["row.$c"] = $v;
            }
            $result = $this->conditionTree->evaluateBlocks($children, $fields, $node);
            if (!is_array($result)) continue;
            foreach ((isset($result['type']) ? [$result] : $result) as $action) {
                if (!is_array($action)) continue;
                if (($action['type'] ?? null) === 'increment') {
                    $cid = isset($action['categoryId']) ? (int) $action['categoryId'] : 0;
                    $key = isset($action['key']) ? trim((string) $action['key']) : '';
                    if (!$cid || $key === '') continue;
                    $col = isset($action['column']) && $action['column'] !== '' ? (string) $action['column'] : 'Value#1';
                    $amount = isset($action['amount']) ? (int) $action['amount'] : 1;
                    $ck = "$cid|$key|$col";
                    if (!isset($counters[$ck])) $counters[$ck] = ['catId' => $cid, 'key' => $key, 'col' => $col, 'total' => 0];
                    $counters[$ck]['total'] += $amount;
                } elseif (($action['type'] ?? null) === 'set_inventory') {
                    $perRow = $action;
                    if (!isset($perRow['key']) || trim((string) $perRow['key']) === '') {
                        $perRow['key'] = (string) $rowKey;
                    }
                    $this->applySetInventoryAction($perRow, (string) ($perRow['value'] ?? ''), $node, $rule, $tag);
                } else {
                    $this->applyAction($action, $node, $rule, $tag, $manualTagIds, $appliedDynamicTagIds);
                }
            }
        }

        // Flush accumulated counters into their target cells.
        foreach ($counters as $cnt) {
            $category = $this->em->getRepository(InventoryCategory::class)->find($cnt['catId']);
            if (!$category || $category->getContext()->getId() !== $node->getContext()?->getId()) continue;
            $this->upsertEntry($node, $category, $category->getName(), $cnt['catId'], $cnt['key'], $cnt['col'], (string) $cnt['total'], $rule, $tag);
        }
    }

    /**
     * Walk foreach children and register every `increment` target cell with a
     * zero counter, so rows that never match still write an explicit "0".
     */
    private function seedIncrementCounters(array $blocks, array &$counters): void
    {
        foreach ($blocks as $b) {
            if (!is_array($b)) continue;
            if (!empty($b['children']) && is_array($b['children'])) {
                $this->seedIncrementCounters($b['children'], $counters);
            }
            $res = $b['result'] ?? null;
            if (!is_array($res)) continue;
            foreach ((isset($res['type']) ? [$res] : $res) as $a) {
                if (!is_array($a) || ($a['type'] ?? null) !== 'increment') continue;
                $cid = isset($a['categoryId']) ? (int) $a['categoryId'] : 0;
                $key = isset($a['key']) ? trim((string) $a['key']) : '';
                if (!$cid || $key === '') continue;
                $col = isset($a['column']) && $a['column'] !== '' ? (string) $a['column'] : 'Value#1';
                $ck = "$cid|$key|$col";
                if (!isset($counters[$ck])) $counters[$ck] = ['catId' => $cid, 'key' => $key, 'col' => $col, 'total' => 0];
            }
        }
    }

    /**
     * Persist a dynamic tag for the node, deduplicated against manual tags and
     * tags already applied during this run. Shared by `set_tag` and `count`.
     */
    private function applySetTagAction(int $tagId, Node $node, CollectionRule $rule, array &$manualTagIds, array &$appliedDynamicTagIds): void
    {
        if (!$tagId) return;
        if (isset($manualTagIds[$tagId]) || isset($appliedDynamicTagIds[$tagId])) {
            return;
        }
        $nodeTag = $this->em->getRepository(NodeTag::class)->find($tagId);
        if (!$nodeTag || $nodeTag->getContext()?->getId() !== $node->getContext()?->getId()) {
            return;
        }
        $assignment = new NodeDynamicTag();
        $assignment->setNode($node);
        $assignment->setTag($nodeTag);
        $assignment->setRule($rule);
        $this->em->persist($assignment);
        $appliedDynamicTagIds[$tagId] = true;
    }

    /**
     * Write a value to an inventory cell. `keyMode = "all"` stamps every row
     * already produced by THIS rule; otherwise the single `key` is targeted.
     * Shared by `set_inventory` and `count` (inventory target).
     */
    private function applySetInventoryAction(array $action, string $value, Node $node, CollectionRule $rule, CollectionTag $tag): void
    {
        $catId = isset($action['categoryId']) ? (int) $action['categoryId'] : 0;
        $col = isset($action['column']) && $action['column'] !== '' ? (string) $action['column'] : 'Value#1';
        if (!$catId) return;
        $category = $this->em->getRepository(InventoryCategory::class)->find($catId);
        if (!$category || $category->getContext()->getId() !== $node->getContext()?->getId()) {
            return;
        }

        $keyMode = (string) ($action['keyMode'] ?? 'single');
        if ($keyMode === 'all') {
            // Stamp every existing row produced by THIS rule on THIS node
            // for the chosen category. Doesn't create rows from thin air —
            // an extract must have run first and produced at least one entry.
            $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $node,
                'category' => $category,
                'rule' => $rule,
            ]);
            $seenKeys = [];
            foreach ($entries as $entry) {
                $entryKey = $entry->getEntryKey();
                if (isset($seenKeys[$entryKey])) continue;
                $seenKeys[$entryKey] = true;
                $this->upsertEntry($node, $category, $category->getName(), $catId, $entryKey, $col, $value, $rule, $tag);
            }
        } else {
            $key = isset($action['key']) ? trim((string) $action['key']) : '';
            if ($key === '') return;
            $this->upsertEntry($node, $category, $category->getName(), $catId, $key, $col, $value, $rule, $tag);
        }
    }

    private function getRuleOutput(CollectionRule $rule, string $baseDir, Collection $collection, Node $node): ?string
    {
        if ($rule->getSource() === CollectionRule::SOURCE_LOCAL) {
            $command = $rule->getCommand();
            $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();

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

    private function applyExtract(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, CollectionTag $tag): void
    {
        $regex = $ext->getRegex();
        if (!$regex) return;

        if ($ext->getExtractMode() === CollectionRuleExtract::EXTRACT_MODE_BLOCK) {
            $this->applyBlockExtract($ext, $text, $node, $rule, $tag);
            return;
        }

        // --- Line mode (default, unchanged) ---
        $this->applyExtractOnText($ext, $text, $node, $rule, $tag, null);
    }

    /**
     * Block mode: split the text into blocks using blockSeparator, then apply
     * the normal line-by-line extraction within each block individually.
     */
    private function applyBlockExtract(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, CollectionTag $tag): void
    {
        $separator = $ext->getBlockSeparator();
        if (!$separator) return;

        $separatorRegex = '~' . $separator . '~m';
        if (@preg_match_all($separatorRegex, $text, $matches, PREG_OFFSET_CAPTURE) === false || empty($matches[0])) {
            return;
        }

        $positions = array_map(fn($m) => (int) $m[1], $matches[0]);
        $blockKeyGroup = $ext->getBlockKeyGroup();
        $blockKeyTemplate = $ext->getBlockKeyTemplate();
        $blockCaptures = $ext->getBlockCaptures() ?? [];

        for ($i = 0, $n = count($positions); $i < $n; $i++) {
            $start = $positions[$i];
            $end = $positions[$i + 1] ?? strlen($text);
            $blockText = substr($text, $start, $end - $start);

            // Evaluate per-block named captures against this block's body.
            // Each capture's regex runs in /m mode (line-anchored ^/$), and its
            // chosen group is exposed to the template as ${name}.
            $vars = [];
            foreach ($blockCaptures as $cap) {
                if (!is_array($cap)) continue;
                $cname = isset($cap['name']) ? (string) $cap['name'] : '';
                $cregex = isset($cap['regex']) ? (string) $cap['regex'] : '';
                $cgroup = isset($cap['group']) ? (int) $cap['group'] : 1;
                if ($cname === '' || $cregex === '') continue;
                if (@preg_match('~' . $cregex . '~m', $blockText, $cm) === 1) {
                    $vars[$cname] = trim((string) ($cm[$cgroup] ?? ''));
                } else {
                    $vars[$cname] = '';
                }
            }

            // Compose the block key.
            //   blockKeyTemplate wins when set:
            //     - ${name} → blockCaptures values
            //     - $1, $2, … → separator capture groups
            //   else blockKeyGroup picks one separator group (legacy behaviour).
            $blockKey = null;
            if ($blockKeyTemplate !== null && $blockKeyTemplate !== '') {
                $tpl = $blockKeyTemplate;
                $tpl = preg_replace_callback(
                    '/\$\{([^}]+)\}/',
                    fn($r) => $vars[$r[1]] ?? '',
                    $tpl,
                ) ?? $tpl;
                $tpl = preg_replace_callback(
                    '/\$(\d+)/',
                    function ($r) use ($matches, $i) {
                        $g = (int) $r[1];
                        // Only substitute groups the block SEPARATOR captured.
                        // Leave the others untouched so the per-line regex match
                        // (applyExtractOnText) can fill them — this is what lets a
                        // block key vary per row (e.g. "$port - Tx $1").
                        return isset($matches[$g][$i]) ? trim((string) $matches[$g][$i][0]) : $r[0];
                    },
                    $tpl,
                ) ?? $tpl;
                $blockKey = trim((string) $tpl);
            } elseif ($blockKeyGroup !== null && isset($matches[$blockKeyGroup][$i])) {
                $blockKey = trim((string) $matches[$blockKeyGroup][$i][0]);
            }

            $this->applyExtractOnText($ext, $blockText, $node, $rule, $tag, $blockKey);
        }
    }

    /**
     * Apply extraction regex on a text fragment (either the full output in line
     * mode, or a single block in block mode). If $blockKey is provided, it
     * overrides the normal key resolution for all entries created.
     */
    /** @var array<string, NodeInventoryEntry> Track persisted entries to avoid duplicate key violations */
    private array $entryIndex = [];

    private function applyExtractOnText(CollectionRuleExtract $ext, string $text, Node $node, CollectionRule $rule, CollectionTag $tag, ?string $blockKey): void
    {
        $regex = $ext->getRegex();
        $hasValueMap = $ext->getValueMap() && count($ext->getValueMap()) > 0;
        $categoryName = $ext->getCategory() ? $ext->getCategory()->getName() : 'Uncategorized';
        $catId = $ext->getCategory()?->getId() ?? 0;

        $lines = explode("\n", $text);

        foreach ($lines as $rawLine) {
            $line = rtrim($rawLine, "\r");
            if (!preg_match('~' . $regex . '~', $line, $m)) {
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
                // Explicit null/empty check — the manual key may legitimately be
                // the literal "0", which PHP's `?:` would treat as falsy.
                $km = $ext->getKeyManual();
                $key = ($km !== null && $km !== '') ? $km : $ext->getName();
                if ($key !== null && $key !== '' && preg_match('/\$\d/', $key)) {
                    $key = preg_replace_callback('/\$(\d+)/', fn($r) => $m[(int)$r[1]] ?? '', $key);
                }
            }
            if ($key === null || $key === '') continue;

            // Resolve values
            if ($hasValueMap) {
                foreach ($ext->getValueMap() as $vm) {
                    $label = $vm['label'] ?? 'Value';
                    $group = $vm['group'] ?? 1;
                    $value = $m[$group] ?? '';
                    $value = $this->applyTranslation($rule, $ext, $value);

                    $this->upsertEntry($node, $ext->getCategory(), $categoryName, $catId, $key, $label, $value, $rule, $tag);
                }
            } else {
                $vg = $ext->getKeyMode() === CollectionRuleExtract::KEY_MODE_EXTRACT
                    ? ($ext->getValueGroup() ?? 2)
                    : ($ext->getValueGroup() ?? 1);
                $value = $m[$vg] ?? $m[1] ?? $m[0] ?? '';
                $value = $this->applyTranslation($rule, $ext, $value);

                $this->upsertEntry($node, $ext->getCategory(), $categoryName, $catId, $key, 'Value#1', $value, $rule, $tag);
            }
        }
    }

    private function upsertEntry(
        Node $node, ?InventoryCategory $category, string $categoryName, int $catId,
        string $key, string $label, string $value,
        CollectionRule $rule, CollectionTag $tag,
    ): void {
        $indexKey = "$catId:$key:$label";
        if (isset($this->entryIndex[$indexKey])) {
            // Update existing entry in this batch
            $this->entryIndex[$indexKey]->setValue($value);
            $this->entryIndex[$indexKey]->setUpdatedAt(new \DateTimeImmutable());
            return;
        }

        $entry = new NodeInventoryEntry();
        $entry->setNode($node);
        $entry->setCategory($category);
        $entry->setCategoryName($categoryName);
        $entry->setEntryKey($key);
        $entry->setColLabel($label);
        $entry->setValue($value);
        $entry->setRule($rule);
        $entry->setCollectionTag($tag);
        $entry->setUpdatedAt(new \DateTimeImmutable());
        $this->em->persist($entry);
        $this->entryIndex[$indexKey] = $entry;
    }

    private function extractNodeFieldValue(CollectionRuleExtract $ext, string $text): ?string
    {
        $regex = $ext->getRegex();
        $group = $ext->getNodeFieldGroup() ?? 1;
        $lines = explode("\n", $text);

        foreach ($lines as $rawLine) {
            $line = rtrim($rawLine, "\r");
            if (preg_match('~' . $regex . '~', $line, $m)) {
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
            'matches' => (bool) @preg_match('~' . ($compareValue ?? '') . '~', $value),
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

<?php

namespace App\Service;

use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionTag;
use App\Entity\Context;
use App\Entity\Node;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class CollectionImporter
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    /**
     * Parse raw command output for a node and persist a completed Collection on disk.
     * Caller is responsible for dispatching ProcessInventoryMessage.
     *
     * @throws \RuntimeException if the node has no commands configured
     */
    public function importRawOutputForNode(
        Node $node,
        string $rawOutput,
        array $tags,
        string $worker,
        ?string $promptPattern = null,
    ): Collection {
        $model = $node->getModel();
        if (!$model) {
            throw new \RuntimeException('Node has no model configured');
        }

        $commands = $this->resolveModelCommands($model);
        if (empty($commands)) {
            throw new \RuntimeException('No commands configured for this model');
        }

        $cmdLines = [];
        foreach ($commands as $cmd) {
            foreach (array_filter(array_map('trim', explode("\n", $cmd->getCommands())), fn($l) => $l !== '') as $line) {
                $cmdLines[] = ['command' => $cmd, 'line' => $line];
            }
        }

        $wrappedPattern = $promptPattern !== null && $promptPattern !== '' ? $this->wrapPromptPattern($promptPattern) : null;
        if ($wrappedPattern !== null && @preg_match($wrappedPattern, '') === false) {
            throw new \RuntimeException('Invalid prompt regex pattern');
        }

        $lines = explode("\n", $rawOutput);
        $segments = [];
        $currentSegment = null;

        foreach ($lines as $rawLine) {
            $line = rtrim($rawLine, "\r");
            $trimmed = trim($line);

            $matched = null;

            if ($wrappedPattern !== null) {
                if ($trimmed !== '' && preg_match($wrappedPattern, $trimmed, $m) && isset($m[1])) {
                    $extracted = trim($m[1]);
                    foreach ($cmdLines as $cl) {
                        if ($extracted === $cl['line']) {
                            $matched = $cl;
                            break;
                        }
                    }
                }
            } else {
                foreach ($cmdLines as $cl) {
                    if (str_ends_with($trimmed, $cl['line']) || $trimmed === $cl['line']) {
                        $matched = $cl;
                        break;
                    }
                }
            }

            if ($matched) {
                if ($currentSegment) {
                    $segments[] = $currentSegment;
                }
                $currentSegment = ['command' => $matched['command'], 'line' => $matched['line'], 'output' => ''];
            } elseif ($currentSegment) {
                $currentSegment['output'] .= $line . "\n";
            }
        }
        if ($currentSegment) {
            $segments[] = $currentSegment;
        }

        $normalizedTags = array_values(array_unique(array_merge(['latest'], $tags)));
        foreach ($normalizedTags as $tag) {
            $this->releaseTag($tag, $node);
        }

        $collection = new Collection();
        $collection->setNode($node);
        $collection->setContext($node->getContext());
        $collection->setTags($normalizedTags);
        $collection->setStatus(Collection::STATUS_COMPLETED);
        $collection->setWorker($worker);
        $collection->setStartedAt(new \DateTimeImmutable());
        $collection->setCompletedAt(new \DateTimeImmutable());
        $collection->setCommandCount(count($commands));
        $collection->setCompletedCount(count(array_unique(array_map(fn($s) => $s['command']->getId(), $segments))));

        $this->em->persist($collection);
        $this->em->flush();

        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();

        foreach ($segments as $seg) {
            $cmd = $seg['command'];
            $ruleSlug = $cmd->getId() . '_' . $this->slugify($cmd->getName());
            $ruleDir = $baseDir . '/' . $ruleSlug;
            if (!is_dir($ruleDir)) {
                mkdir($ruleDir, 0775, true);
            }

            $lineSlug = $this->slugify($seg['line']);
            $filepath = $ruleDir . '/' . $lineSlug . '.txt';

            $output = $seg['output'];
            $outputLines = explode("\n", $output);
            if (!empty($outputLines) && preg_match('/[#>\$\]]\s*$/', end($outputLines))) {
                array_pop($outputLines);
            }
            while (!empty($outputLines) && trim(end($outputLines)) === '') {
                array_pop($outputLines);
            }

            file_put_contents($filepath, implode("\n", $outputLines));
        }

        return $collection;
    }

    /**
     * Process a ZIP archive containing <ip>_output.log files and import each into a Collection.
     *
     * @return array{dryRun: bool, totalFiles: int, imported: int, files: array<int, array<string, mixed>>, importedCollections: array<int, Collection>}
     */
    public function importZipArchive(
        string $zipPath,
        Context $context,
        array $extraTags,
        ?string $promptPattern,
        bool $dryRun,
        string $worker,
    ): array {
        if (!class_exists(\ZipArchive::class)) {
            throw new \RuntimeException('ZIP support is not available on the server');
        }

        $zip = new \ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new \RuntimeException('Unable to open the ZIP archive');
        }

        $tags = array_values(array_unique(array_merge(['latest', 'imported'], $extraTags)));

        if ($promptPattern !== null && $promptPattern !== '' && @preg_match($this->wrapPromptPattern($promptPattern), '') === false) {
            $zip->close();
            throw new \RuntimeException('Invalid prompt regex pattern');
        }

        $nodeRepo = $this->em->getRepository(Node::class);
        $entries = [];
        $importedCollections = [];
        $imported = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) continue;
            $entryName = $stat['name'];
            if (str_ends_with($entryName, '/')) continue;
            $basename = basename($entryName);

            $entry = [
                'filename' => $entryName,
                'ipAddress' => null,
                'nodeId' => null,
                'nodeName' => null,
                'status' => 'invalid-name',
                'message' => null,
                'collectionId' => null,
            ];

            if (!preg_match('/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})_output\.log$/i', $basename, $m)) {
                $entry['message'] = 'Filename must match <ip>_output.log';
                $entries[] = $entry;
                continue;
            }
            $ip = $m[1];
            $entry['ipAddress'] = $ip;

            $node = $nodeRepo->findOneBy(['ipAddress' => $ip, 'context' => $context]);
            if (!$node) {
                $entry['status'] = 'no-node';
                $entry['message'] = 'No node matches this IP in the current context';
                $entries[] = $entry;
                continue;
            }
            $entry['nodeId'] = $node->getId();
            $entry['nodeName'] = $node->getHostname() ?: $node->getName() ?: $node->getIpAddress();

            if (!$node->getModel()) {
                $entry['status'] = 'no-model';
                $entry['message'] = 'Node has no model configured';
                $entries[] = $entry;
                continue;
            }

            if ($dryRun) {
                $entry['status'] = 'matched';
                $entries[] = $entry;
                continue;
            }

            $rawOutput = $zip->getFromIndex($i);
            if ($rawOutput === false || $rawOutput === '') {
                $entry['status'] = 'empty';
                $entry['message'] = 'File is empty or unreadable';
                $entries[] = $entry;
                continue;
            }

            try {
                $collection = $this->importRawOutputForNode($node, $rawOutput, $tags, $worker, $promptPattern);
            } catch (\RuntimeException $e) {
                $entry['status'] = 'failed';
                $entry['message'] = $e->getMessage();
                $entries[] = $entry;
                continue;
            }

            $importedCollections[] = $collection;
            $entry['status'] = 'imported';
            $entry['collectionId'] = $collection->getId();
            $entries[] = $entry;
            $imported++;
        }

        $zip->close();

        return [
            'dryRun' => $dryRun,
            'totalFiles' => count($entries),
            'imported' => $imported,
            'files' => $entries,
            'importedCollections' => $importedCollections,
        ];
    }

    public function wrapPromptPattern(string $pattern): string
    {
        return '~' . str_replace('~', '\~', $pattern) . '~';
    }

    /**
     * Resolve all commands for a model (manufacturer + model folders + manual, recursive).
     * @return CollectionCommand[]
     */
    private function resolveModelCommands($model): array
    {
        $commands = [];
        $seenIds = [];
        $cmdRepo = $this->em->getRepository(CollectionCommand::class);
        $folderRepo = $this->em->getRepository(CollectionFolder::class);

        $collectRecursive = function (CollectionFolder $folder, bool $skipModel) use ($cmdRepo, $folderRepo, &$commands, &$seenIds, &$collectRecursive): void {
            foreach ($cmdRepo->findBy(['folder' => $folder, 'enabled' => true], ['name' => 'ASC']) as $c) {
                if (!in_array($c->getId(), $seenIds, true)) { $seenIds[] = $c->getId(); $commands[] = $c; }
            }
            foreach ($folderRepo->findBy(['parent' => $folder], ['name' => 'ASC']) as $child) {
                if ($skipModel && $child->getType() === CollectionFolder::TYPE_MODEL) continue;
                $collectRecursive($child, $skipModel);
            }
        };

        $manFolder = $folderRepo->findOneBy(['manufacturer' => $model->getManufacturer(), 'model' => null, 'type' => CollectionFolder::TYPE_MANUFACTURER]);
        if ($manFolder) $collectRecursive($manFolder, true);

        $modelFolder = $folderRepo->findOneBy(['model' => $model, 'type' => CollectionFolder::TYPE_MODEL]);
        if ($modelFolder) $collectRecursive($modelFolder, false);

        foreach ($model->getManualCommands() as $c) {
            if ($c->isEnabled() && !in_array($c->getId(), $seenIds, true)) { $seenIds[] = $c->getId(); $commands[] = $c; }
        }

        return $commands;
    }

    private function slugify(string $text): string
    {
        return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $text), '-'));
    }

    private function releaseTag(string $tag, Node $node, ?Collection $except = null): void
    {
        $existing = $this->em->getRepository(CollectionTag::class)->findOneByNodeAndName($node, $tag);
        if (!$existing) return;
        if ($except && $existing->getCollection()->getId() === $except->getId()) return;
        // Direct DELETE so the unique (node_id, name) row is gone before any
        // new CollectionTag with the same key is INSERTed in the current UOW.
        $this->em->createQueryBuilder()
            ->delete(CollectionTag::class, 'ct')
            ->where('ct.id = :id')
            ->setParameter('id', $existing->getId())
            ->getQuery()
            ->execute();
        $this->em->detach($existing);
    }
}

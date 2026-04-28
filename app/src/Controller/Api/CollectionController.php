<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\Context;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use App\Message\ProcessInventoryMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/collections')]
class CollectionController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
    ) {}

    private function serialize(Collection $c): array
    {
        $node = $c->getNode();
        return [
            'id' => $c->getId(),
            'node' => [
                'id' => $node->getId(),
                'name' => $node->getName(),
                'hostname' => $node->getHostname(),
                'ipAddress' => $node->getIpAddress(),
            ],
            'tags' => $c->getTags(),
            'status' => $c->getStatus(),
            'worker' => $c->getWorker(),
            'commandCount' => $c->getCommandCount(),
            'completedCount' => $c->getCompletedCount(),
            'error' => $c->getError(),
            'startedAt' => $c->getStartedAt()?->format('c'),
            'completedAt' => $c->getCompletedAt()?->format('c'),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $collections = $em->getRepository(Collection::class)->findBy(
            ['context' => $context],
            ['createdAt' => 'DESC']
        );

        return $this->json(array_map($this->serialize(...), $collections));
    }

    #[Route('/bulk-delete', methods: ['POST'])]
    public function bulkDelete(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ids = $data['ids'] ?? [];

        if (empty($ids)) {
            return $this->json(['error' => 'No IDs provided'], Response::HTTP_BAD_REQUEST);
        }

        $collections = $em->getRepository(Collection::class)->findBy(['id' => $ids]);

        foreach ($collections as $collection) {
            $storageDir = $this->getParameter('kernel.project_dir') . '/var/' . $collection->getStoragePath();
            $this->deleteDirectory($storageDir);
            $em->remove($collection);
        }

        $em->flush();

        return $this->json(['deleted' => count($collections)]);
    }

    #[Route('/collect', methods: ['POST'])]
    public function collect(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];
        $rawTags = $data['tags'] ?? [];
        // Backward compat: accept single 'tag' string
        if (empty($rawTags) && !empty($data['tag'])) {
            $rawTags = [trim($data['tag'])];
        }
        $tags = array_values(array_unique(array_filter(array_map('trim', array_merge(['latest'], $rawTags)))));
        $contextId = $request->query->getInt('context');

        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $collections = [];

        foreach ($nodes as $node) {
            // Release tags from other collections of the same node
            foreach ($tags as $tag) {
                $this->releaseTag($em, $tag, $node);
            }

            $collection = new Collection();
            $collection->setNode($node);
            $collection->setContext($context);
            $collection->setTags($tags);

            $em->persist($collection);
            $collections[] = $collection;
        }

        $em->flush();

        foreach ($collections as $collection) {
            $this->bus->dispatch(new CollectNodeMessage($collection->getId()));
        }

        return $this->json([
            'dispatched' => count($collections),
            'collections' => array_map($this->serialize(...), $collections),
        ], Response::HTTP_CREATED);
    }

    #[Route('/extract', methods: ['POST'])]
    public function extract(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $dispatched = 0;

        foreach ($nodes as $node) {
            // Find the latest completed collection with 'latest' tag
            $row = $em->getConnection()->fetchAssociative(
                'SELECT id FROM collection WHERE node_id = :node AND status = :status AND tags::text LIKE :tag ORDER BY completed_at DESC LIMIT 1',
                ['node' => $node->getId(), 'status' => Collection::STATUS_COMPLETED, 'tag' => '%"latest"%']
            );

            if ($row) {
                $this->bus->dispatch(new ProcessInventoryMessage((int) $row['id']));
                $dispatched++;
            }
        }

        return $this->json(['dispatched' => $dispatched]);
    }

    #[Route('/by-node/{id}', methods: ['GET'])]
    public function byNode(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $collections = $em->getRepository(Collection::class)->findBy(
            ['node' => $node],
            ['createdAt' => 'DESC'],
            50
        );

        return $this->json(array_map($this->serialize(...), $collections));
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Collection $collection): JsonResponse
    {
        $data = $this->serialize($collection);

        // Build tree: rules (folders) → command files
        $storageDir = $this->getParameter('kernel.project_dir') . '/var/' . $collection->getStoragePath();
        $rules = [];

        if (is_dir($storageDir)) {
            $items = scandir($storageDir);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                $itemPath = $storageDir . '/' . $item;

                if (is_dir($itemPath)) {
                    // Rule folder
                    $files = [];
                    $subItems = scandir($itemPath);
                    foreach ($subItems as $sub) {
                        if ($sub === '.' || $sub === '..') continue;
                        $subPath = $itemPath . '/' . $sub;
                        if (is_file($subPath)) {
                            $files[] = [
                                'filename' => $sub,
                                'size' => filesize($subPath),
                            ];
                        }
                    }
                    sort($files);
                    $rules[] = [
                        'name' => $item,
                        'files' => $files,
                    ];
                }
            }
            sort($rules);
        }

        $data['rules'] = $rules;

        return $this->json($data);
    }

    #[Route('/{id}/download', methods: ['GET'])]
    public function download(Collection $collection): Response
    {
        $storageDir = $this->getParameter('kernel.project_dir') . '/var/' . $collection->getStoragePath();

        if (!is_dir($storageDir)) {
            return $this->json(['error' => 'No files found for this collection'], Response::HTTP_NOT_FOUND);
        }

        $node = $collection->getNode();
        $nodeName = $node->getName() ?: $node->getHostname() ?: $node->getIpAddress();
        $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $nodeName);
        $filename = sprintf('collection_%d_%s.tar.gz', $collection->getId(), $safeName);

        $tmpFile = tempnam(sys_get_temp_dir(), 'col_') . '.tar.gz';

        $command = sprintf(
            'tar -czf %s -C %s .',
            escapeshellarg($tmpFile),
            escapeshellarg($storageDir)
        );
        exec($command, $output, $exitCode);

        if ($exitCode !== 0) {
            @unlink($tmpFile);
            return $this->json(['error' => 'Failed to create archive'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $response = new BinaryFileResponse($tmpFile);
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $filename);
        $response->headers->set('Content-Type', 'application/gzip');
        $response->deleteFileAfterSend(true);

        return $response;
    }

    #[Route('/{id}/files/{path}', methods: ['GET'], requirements: ['path' => '.+'])]
    public function readFile(Collection $collection, string $path): Response
    {
        $storageDir = $this->getParameter('kernel.project_dir') . '/var/' . $collection->getStoragePath();

        // Sanitize: only allow traversal within the collection directory
        $realBase = realpath($storageDir);
        $filepath = realpath($storageDir . '/' . $path);

        if (!$filepath || !$realBase || !str_starts_with($filepath, $realBase) || !is_file($filepath)) {
            return $this->json(['error' => 'File not found'], Response::HTTP_NOT_FOUND);
        }

        return new Response(
            file_get_contents($filepath),
            Response::HTTP_OK,
            ['Content-Type' => 'text/plain; charset=utf-8']
        );
    }

    #[Route('/{id}/tags', methods: ['POST'])]
    public function addTag(Collection $collection, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $tag = trim($data['tag'] ?? '');
        if ($tag === '') {
            return $this->json(['error' => 'Tag is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->releaseTag($em, $tag, $collection->getNode(), $collection);
        $collection->addTag($tag);
        $em->flush();
        return $this->json($this->serialize($collection));
    }

    #[Route('/{id}/tags/{tag}', methods: ['DELETE'])]
    public function removeTag(Collection $collection, string $tag, EntityManagerInterface $em): JsonResponse
    {
        $collection->removeTag($tag);
        $em->flush();
        return $this->json($this->serialize($collection));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Collection $collection, EntityManagerInterface $em): JsonResponse
    {
        $storageDir = $this->getParameter('kernel.project_dir') . '/var/' . $collection->getStoragePath();
        $this->deleteDirectory($storageDir);

        $em->remove($collection);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/import', methods: ['POST'], priority: 10)]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeId = $data['nodeId'] ?? null;
        $rawOutput = $data['rawOutput'] ?? '';
        $tags = $data['tags'] ?? ['latest'];
        $promptPattern = isset($data['promptPattern']) ? trim((string) $data['promptPattern']) : '';

        if (!$nodeId || !$rawOutput) {
            return $this->json(['error' => 'nodeId and rawOutput are required'], Response::HTTP_BAD_REQUEST);
        }

        $node = $em->getRepository(Node::class)->find($nodeId);
        if (!$node) return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);

        if (!$node->getModel()) {
            return $this->json(['error' => 'Node has no model configured'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $collection = $this->importRawOutputForNode($node, $rawOutput, $tags, 'manual-import', $em, $promptPattern ?: null);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        $this->bus->dispatch(new ProcessInventoryMessage($collection->getId()));

        return $this->json($this->serialize($collection), Response::HTTP_CREATED);
    }

    #[Route('/import-zip', methods: ['POST'], priority: 10)]
    public function importZip(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $dryRun = $request->query->getBoolean('dryRun');

        /** @var \Symfony\Component\HttpFoundation\File\UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file || !$file->isValid()) {
            return $this->json(['error' => 'A .zip file is required'], Response::HTTP_BAD_REQUEST);
        }

        if (!class_exists(\ZipArchive::class)) {
            return $this->json(['error' => 'ZIP support is not available on the server'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $zip = new \ZipArchive();
        if ($zip->open($file->getPathname()) !== true) {
            return $this->json(['error' => 'Unable to open the ZIP archive'], Response::HTTP_BAD_REQUEST);
        }

        $extraTags = array_values(array_filter(array_map('trim', (array) $request->request->all('tags'))));
        $tags = array_values(array_unique(array_merge(['latest', 'imported'], $extraTags)));
        $promptPattern = trim((string) $request->request->get('promptPattern', '')) ?: null;

        if ($promptPattern !== null && @preg_match($this->wrapPromptPattern($promptPattern), '') === false) {
            return $this->json(['error' => 'Invalid prompt regex pattern'], Response::HTTP_BAD_REQUEST);
        }

        $nodeRepo = $em->getRepository(Node::class);
        $entries = [];
        $imported = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if ($stat === false) continue;
            $entryName = $stat['name'];
            if (str_ends_with($entryName, '/')) continue; // skip directories
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
                $collection = $this->importRawOutputForNode($node, $rawOutput, $tags, 'zip-import', $em, $promptPattern);
            } catch (\RuntimeException $e) {
                $entry['status'] = 'failed';
                $entry['message'] = $e->getMessage();
                $entries[] = $entry;
                continue;
            }

            $this->bus->dispatch(new ProcessInventoryMessage($collection->getId()));

            $entry['status'] = 'imported';
            $entry['collectionId'] = $collection->getId();
            $entries[] = $entry;
            $imported++;
        }

        $zip->close();

        return $this->json([
            'dryRun' => $dryRun,
            'totalFiles' => count($entries),
            'imported' => $imported,
            'files' => $entries,
        ]);
    }

    /**
     * Parse raw command output for a node and persist a completed Collection on disk.
     * Caller is responsible for dispatching ProcessInventoryMessage.
     *
     * @param string|null $promptPattern Optional regex (without delimiters) whose first capture group
     *                                   isolates the command typed at the prompt. When provided, only
     *                                   lines matching this pattern can introduce a new command segment,
     *                                   protecting against command names that also appear in device logs.
     *
     * @throws \RuntimeException if the node has no commands configured
     */
    private function importRawOutputForNode(Node $node, string $rawOutput, array $tags, string $worker, EntityManagerInterface $em, ?string $promptPattern = null): Collection
    {
        $model = $node->getModel();
        if (!$model) {
            throw new \RuntimeException('Node has no model configured');
        }

        $commands = $this->resolveModelCommands($model, $em);
        if (empty($commands)) {
            throw new \RuntimeException('No commands configured for this model');
        }

        // Build a flat list of all CLI lines with their parent command
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

        // Parse raw output: split by detected command lines
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
            $this->releaseTag($em, $tag, $node);
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

        $em->persist($collection);
        $em->flush();

        $projectDir = $this->getParameter('kernel.project_dir');
        $baseDir = $projectDir . '/var/' . $collection->getStoragePath();

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

    /** Resolve all commands for a model (manufacturer + model folders + manual, recursive) */
    private function resolveModelCommands($model, EntityManagerInterface $em): array
    {
        $commands = [];
        $seenIds = [];
        $cmdRepo = $em->getRepository(CollectionCommand::class);
        $folderRepo = $em->getRepository(CollectionFolder::class);

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

    private function wrapPromptPattern(string $pattern): string
    {
        return '~' . str_replace('~', '\~', $pattern) . '~';
    }

    private function releaseTag(EntityManagerInterface $em, string $tag, Node $node, ?Collection $except = null): void
    {
        $all = $em->getRepository(Collection::class)->findBy(['node' => $node]);
        foreach ($all as $col) {
            if ($except && $col->getId() === $except->getId()) continue;
            if (in_array($tag, $col->getTags(), true)) {
                $col->removeTag($tag);
            }
        }
    }

    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) return;

        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
    }
}

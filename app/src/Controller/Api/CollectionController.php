<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\CollectionTag;
use App\Entity\Context;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use App\Message\ProcessInventoryMessage;
use App\Security\Voter\ContextAccessVoter;
use App\Service\CollectionImporter;
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
        private readonly CollectionImporter $importer,
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
            'tags' => $c->getTagNames(),
            'pendingTags' => $c->getPendingTags(),
            'collectionTags' => array_map(fn(CollectionTag $t) => [
                'id' => $t->getId(),
                'name' => $t->getName(),
                'createdAt' => $t->getCreatedAt()->format('c'),
            ], $c->getCollectionTags()->toArray()),
            'status' => $c->getStatus(),
            'worker' => $c->getWorker(),
            'commandCount' => $c->getCommandCount(),
            'completedCount' => $c->getCompletedCount(),
            'error' => $c->getError(),
            'startedAt' => $c->getStartedAt()?->format('c'),
            'completedAt' => $c->getCompletedAt()?->format('c'),
            'createdAt' => $c->getCreatedAt()->format('c'),
            'extractStatus' => $c->getExtractStatus(),
            'lastExtractedAt' => $c->getLastExtractedAt()?->format('c'),
            'extractError' => $c->getExtractError(),
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

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
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $collections = [];

        foreach ($nodes as $node) {
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
            // Defer the tag swap to the message handler — applied only after a
            // successful collect so the prior collection (and its inventory)
            // stays intact if the new collect fails.
            $collection = new Collection();
            $collection->setNode($node);
            $collection->setContext($context);
            $collection->setPendingTags($tags);

            $em->persist($collection);
            $collections[] = $collection;
        }

        $em->flush();

        foreach ($collections as $collection) {
            $this->bus->dispatch(new CollectNodeMessage($collection->getId(), chainCompliance: true));
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
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
            $latestTag = $em->getRepository(CollectionTag::class)->findLatestForNode($node);
            $col = $latestTag?->getCollection();
            if ($col && $col->getStatus() === Collection::STATUS_COMPLETED) {
                $this->bus->dispatch(new ProcessInventoryMessage($col->getId(), chainCompliance: true));
                $dispatched++;
            }
        }

        return $this->json(['dispatched' => $dispatched]);
    }

    #[Route('/by-node/{id}', methods: ['GET'])]
    public function byNode(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
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

    #[Route('/bulk-tags/add', methods: ['POST'])]
    public function bulkAddTag(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ids = $data['ids'] ?? [];
        $tag = trim($data['tag'] ?? '');
        if (empty($ids) || $tag === '') {
            return $this->json(['error' => 'ids and tag are required'], Response::HTTP_BAD_REQUEST);
        }

        $collections = $em->getRepository(Collection::class)->findBy(['id' => $ids]);
        $updated = [];
        $toExtract = [];
        foreach ($collections as $collection) {
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
            $this->releaseTag($em, $tag, $collection->getNode(), $collection);
            $collection->addTag($tag);
            $updated[] = $collection;
            if ($collection->getStatus() === Collection::STATUS_COMPLETED) {
                $toExtract[] = $collection->getId();
            }
        }
        $em->flush();

        foreach ($toExtract as $cid) {
            $this->bus->dispatch(new ProcessInventoryMessage($cid, tagName: $tag));
        }

        return $this->json(array_map($this->serialize(...), $updated));
    }

    #[Route('/bulk-tags/remove', methods: ['POST'])]
    public function bulkRemoveTag(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ids = $data['ids'] ?? [];
        $tag = trim($data['tag'] ?? '');
        if (empty($ids) || $tag === '') {
            return $this->json(['error' => 'ids and tag are required'], Response::HTTP_BAD_REQUEST);
        }

        $collections = $em->getRepository(Collection::class)->findBy(['id' => $ids]);
        $updated = [];
        foreach ($collections as $collection) {
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
            $collection->removeTag($tag);
            $updated[] = $collection;
        }
        $em->flush();

        return $this->json(array_map($this->serialize(...), $updated));
    }

    #[Route('/{id}/tags', methods: ['POST'])]
    public function addTag(Collection $collection, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
        $data = json_decode($request->getContent(), true);
        $tag = trim($data['tag'] ?? '');
        if ($tag === '') {
            return $this->json(['error' => 'Tag is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->releaseTag($em, $tag, $collection->getNode(), $collection);
        $collection->addTag($tag);
        $em->flush();

        // Schedule a per-tag extraction so this tag carries its own inventory snapshot.
        if ($collection->getStatus() === Collection::STATUS_COMPLETED) {
            $this->bus->dispatch(new ProcessInventoryMessage($collection->getId(), tagName: $tag));
        }

        return $this->json($this->serialize($collection));
    }

    #[Route('/{id}/tags/{tag}', methods: ['DELETE'])]
    public function removeTag(Collection $collection, string $tag, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
        // Inventory entries linked to this tag are removed by FK cascade.
        $collection->removeTag($tag);
        $em->flush();
        return $this->json($this->serialize($collection));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Collection $collection, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $collection);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);

        if (!$node->getModel()) {
            return $this->json(['error' => 'Node has no model configured'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $collection = $this->importer->importRawOutputForNode($node, $rawOutput, $tags, 'manual-import', $promptPattern ?: null);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $dryRun = $request->query->getBoolean('dryRun');

        /** @var \Symfony\Component\HttpFoundation\File\UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file || !$file->isValid()) {
            return $this->json(['error' => 'A .zip or .tar.gz file is required'], Response::HTTP_BAD_REQUEST);
        }

        $extraTags = array_values(array_filter(array_map('trim', (array) $request->request->all('tags'))));
        $promptPattern = trim((string) $request->request->get('promptPattern', '')) ?: null;

        try {
            $result = $this->importer->importArchive($file->getPathname(), $context, $extraTags, $promptPattern, $dryRun, 'zip-import');
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        foreach ($result['importedCollections'] as $collection) {
            $this->bus->dispatch(new ProcessInventoryMessage($collection->getId()));
        }

        unset($result['importedCollections']);

        return $this->json($result);
    }

    private function releaseTag(EntityManagerInterface $em, string $tag, Node $node, ?Collection $except = null): void
    {
        $existing = $em->getRepository(CollectionTag::class)->findOneByNodeAndName($node, $tag);
        if (!$existing) return;
        if ($except && $existing->getCollection()->getId() === $except->getId()) return;
        // Direct DELETE so the unique (node_id, name) row is gone before any
        // new CollectionTag with the same key is INSERTed in the current UOW.
        // FK cascade removes the related inventory entries.
        $em->createQueryBuilder()
            ->delete(CollectionTag::class, 'ct')
            ->where('ct.id = :id')
            ->setParameter('id', $existing->getId())
            ->getQuery()
            ->execute();
        $em->detach($existing);
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

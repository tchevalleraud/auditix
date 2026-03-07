<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\Context;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
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
        $tags = array_values(array_unique(array_filter(array_map('trim', $rawTags))));
        $contextId = $request->query->getInt('context');

        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        // Release tags from other collections in same context
        foreach ($tags as $tag) {
            $this->releaseTag($em, $tag, $context);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $collections = [];

        foreach ($nodes as $node) {
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
        $this->releaseTag($em, $tag, $collection->getContext(), $collection);
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

    private function releaseTag(EntityManagerInterface $em, string $tag, Context $context, ?Collection $except = null): void
    {
        $all = $em->getRepository(Collection::class)->findBy(['context' => $context]);
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

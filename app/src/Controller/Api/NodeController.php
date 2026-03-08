<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Entity\Profile;
use App\Message\PingNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/nodes')]
class NodeController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    private function serialize(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        $profile = $n->getProfile();
        $context = $n->getContext();

        return [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'hostname' => $n->getHostname(),
            'score' => $n->getScore(),
            'policy' => $n->getPolicy(),
            'discoveredModel' => $n->getDiscoveredModel(),
            'discoveredVersion' => $n->getDiscoveredVersion(),
            'isReachable' => $n->getIsReachable(),
            'lastPingAt' => $n->getLastPingAt()?->format('c'),
            'monitoringEnabled' => $context?->isMonitoringEnabled() ?? false,
            'manufacturer' => $manufacturer ? [
                'id' => $manufacturer->getId(),
                'name' => $manufacturer->getName(),
                'logo' => $manufacturer->getLogo(),
            ] : null,
            'model' => $model ? [
                'id' => $model->getId(),
                'name' => $model->getName(),
            ] : null,
            'profile' => $profile ? [
                'id' => $profile->getId(),
                'name' => $profile->getName(),
            ] : null,
            'tags' => $n->getTags()->map(fn(NodeTag $t) => [
                'id' => $t->getId(),
                'name' => $t->getName(),
                'color' => $t->getColor(),
            ])->toArray(),
            'createdAt' => $n->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $nodes = $em->getRepository(Node::class)->findBy(
            ['context' => $contextId],
            ['ipAddress' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $nodes));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $ipAddress = $data['ipAddress'] ?? '';
        if (empty($ipAddress)) {
            return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
        }

        $node = new Node();
        $node->setContext($context);
        $node->setName($data['name'] ?? null);
        $node->setIpAddress($ipAddress);
        $node->setPolicy($data['policy'] ?? 'audit');

        if (!empty($data['manufacturerId'])) {
            $node->setManufacturer($em->getRepository(Editor::class)->find($data['manufacturerId']));
        }
        if (!empty($data['modelId'])) {
            $node->setModel($em->getRepository(DeviceModel::class)->find($data['modelId']));
        }
        if (!empty($data['profileId'])) {
            $node->setProfile($em->getRepository(Profile::class)->find($data['profileId']));
        }

        $em->persist($node);
        $em->flush();

        if ($context->isMonitoringEnabled()) {
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        return $this->json($this->serialize($node), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $ipAddress = $data['ipAddress'] ?? '';
        if (empty($ipAddress)) {
            return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
        }

        $node->setName($data['name'] ?? null);
        $node->setIpAddress($ipAddress);
        $node->setPolicy($data['policy'] ?? $node->getPolicy());

        if (array_key_exists('manufacturerId', $data)) {
            $node->setManufacturer($data['manufacturerId'] ? $em->getRepository(Editor::class)->find($data['manufacturerId']) : null);
        }
        if (array_key_exists('modelId', $data)) {
            $node->setModel($data['modelId'] ? $em->getRepository(DeviceModel::class)->find($data['modelId']) : null);
        }
        if (array_key_exists('profileId', $data)) {
            $node->setProfile($data['profileId'] ? $em->getRepository(Profile::class)->find($data['profileId']) : null);
        }
        if (array_key_exists('tagIds', $data)) {
            // Clear and re-set tags
            foreach ($node->getTags()->toArray() as $tag) { $node->removeTag($tag); }
            foreach (($data['tagIds'] ?? []) as $tagId) {
                $tag = $em->getRepository(NodeTag::class)->find($tagId);
                if ($tag) $node->addTag($tag);
            }
        }

        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/tags', methods: ['POST'])]
    public function addTag(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $tagId = $data['tagId'] ?? null;
        if (!$tagId) return $this->json(['error' => 'tagId is required'], Response::HTTP_BAD_REQUEST);

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if (!$tag) return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);

        $node->addTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/tags/{tagId}', methods: ['DELETE'])]
    public function removeTag(Node $node, int $tagId, EntityManagerInterface $em): JsonResponse
    {
        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if ($tag) $node->removeTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/ping', methods: ['POST'])]
    public function ping(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);

        foreach ($nodes as $node) {
            $node->setIsReachable(null);
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        $em->flush();

        return $this->json(['dispatched' => count($nodes)]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Node $node, EntityManagerInterface $em): JsonResponse
    {
        // Delete collection storage files
        $collections = $em->getRepository(Collection::class)->findBy(['node' => $node]);
        foreach ($collections as $collection) {
            $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();
            $this->deleteDirectory($storageDir);
        }

        $em->remove($node);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
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

    #[Route('/{id}/inventory', methods: ['GET'])]
    public function inventory(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $entries = $em->getRepository(NodeInventoryEntry::class)->findBy(
            ['node' => $node],
            ['categoryName' => 'ASC', 'entryKey' => 'ASC', 'colLabel' => 'ASC']
        );

        // Group by category → key → colLabel
        $categories = [];
        foreach ($entries as $entry) {
            $catName = $entry->getCategoryName();
            $catId = $entry->getCategory()?->getId();
            $catKeyLabel = $entry->getCategory()?->getKeyLabel();
            $catKey = $catId ? (string)$catId : '__' . $catName;

            if (!isset($categories[$catKey])) {
                $categories[$catKey] = [
                    'categoryName' => $catName,
                    'keyLabel' => $catKeyLabel,
                    'columns' => [],
                    'rows' => [],
                    'columnSet' => [],
                ];
            }

            $key = $entry->getEntryKey();
            $label = $entry->getColLabel();

            // Track columns
            if (!in_array($label, $categories[$catKey]['columnSet'], true)) {
                $categories[$catKey]['columnSet'][] = $label;
                $categories[$catKey]['columns'][] = ['colKey' => 'col:' . $label, 'label' => $label];
            }

            // Build rows
            if (!isset($categories[$catKey]['rows'][$key])) {
                $categories[$catKey]['rows'][$key] = ['key' => $key, 'values' => []];
            }
            $categories[$catKey]['rows'][$key]['values']['col:' . $label] = $entry->getValue();
        }

        // Convert to indexed arrays
        $result = [];
        foreach ($categories as $cat) {
            unset($cat['columnSet']);
            $cat['rows'] = array_values($cat['rows']);
            $result[] = $cat;
        }

        return $this->json($result);
    }
}

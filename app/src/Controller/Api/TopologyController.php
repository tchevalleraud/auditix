<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\InventoryCategory;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\Topology;
use App\Entity\TopologyAnnotation;
use App\Entity\TopologyFolder;
use App\Entity\TopologyCluster;
use App\Entity\TopologyClusterMember;
use App\Entity\TopologyClusterRule;
use App\Entity\TopologyEdge;
use App\Entity\TopologyNode;
use App\Entity\TopologyProtocol;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/topologies')]
class TopologyController extends AbstractController
{
    private function serialize(Topology $t, ?int $memberCount = null): array
    {
        return [
            'id' => $t->getId(),
            'name' => $t->getName(),
            'description' => $t->getDescription(),
            'folderId' => $t->getFolder()?->getId(),
            'isPrimary' => $t->isPrimary(),
            'nodeDesign' => $t->getNodeDesign(),
            'layout' => $t->getLayout(),
            'viewport' => $t->getViewport(),
            'mapOptions' => $t->getMapOptions(),
            'memberCount' => $memberCount,
            'createdAt' => $t->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updatedAt' => $t->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function resolveContext(Request $request, EntityManagerInterface $em): ?Context
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return null;
        }
        return $em->getRepository(Context::class)->find($contextId);
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $topologies = $em->getRepository(Topology::class)->findBy(
            ['context' => $context],
            ['isPrimary' => 'DESC', 'name' => 'ASC']
        );

        $counts = [];
        if (!empty($topologies)) {
            $rows = $em->createQuery(
                'SELECT IDENTITY(tn.topology) AS topologyId, COUNT(tn.id) AS cnt
                 FROM App\Entity\TopologyNode tn
                 WHERE tn.topology IN (:topologies)
                 GROUP BY tn.topology'
            )->setParameter('topologies', $topologies)->getArrayResult();
            foreach ($rows as $row) {
                $counts[(int)$row['topologyId']] = (int)$row['cnt'];
            }
        }

        return $this->json(array_map(
            fn(Topology $t) => $this->serialize($t, $counts[$t->getId()] ?? 0),
            $topologies
        ));
    }

    #[Route('/tree', methods: ['GET'])]
    public function tree(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['folders' => [], 'rootTopologies' => []]);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        // Member counts for every topology in the context (single query).
        $counts = [];
        $rows = $em->createQuery(
            'SELECT IDENTITY(tn.topology) AS topologyId, COUNT(tn.id) AS cnt
             FROM App\Entity\TopologyNode tn JOIN tn.topology t
             WHERE t.context = :context GROUP BY tn.topology'
        )->setParameter('context', $context)->getArrayResult();
        foreach ($rows as $row) {
            $counts[(int)$row['topologyId']] = (int)$row['cnt'];
        }

        $rootFolders = $em->getRepository(TopologyFolder::class)->findBy(
            ['context' => $context, 'parent' => null],
            ['name' => 'ASC']
        );
        $rootTopologies = $em->getRepository(Topology::class)->findBy(
            ['context' => $context, 'folder' => null],
            ['isPrimary' => 'DESC', 'name' => 'ASC']
        );

        return $this->json([
            'folders' => array_map(fn($f) => $this->serializeFolder($f, $em, $counts), $rootFolders),
            'rootTopologies' => array_map(fn($t) => $this->serialize($t, $counts[$t->getId()] ?? 0), $rootTopologies),
        ]);
    }

    private function serializeFolder(TopologyFolder $f, EntityManagerInterface $em, array $counts): array
    {
        $children = $em->getRepository(TopologyFolder::class)->findBy(['parent' => $f], ['name' => 'ASC']);
        $topologies = $em->getRepository(Topology::class)->findBy(['folder' => $f], ['isPrimary' => 'DESC', 'name' => 'ASC']);
        return [
            'id' => $f->getId(),
            'name' => $f->getName(),
            'type' => 'custom',
            'parentId' => $f->getParent()?->getId(),
            'children' => array_map(fn($c) => $this->serializeFolder($c, $em, $counts), $children),
            'topologies' => array_map(fn($t) => $this->serialize($t, $counts[$t->getId()] ?? 0), $topologies),
        ];
    }

    #[Route('/primary', methods: ['GET'])]
    public function primary(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $topology = $em->getRepository(Topology::class)->findOneBy([
            'context' => $context,
            'isPrimary' => true,
        ]);
        if (!$topology) {
            // Fallback: any topology in the context (helps when no primary explicitly set)
            $topology = $em->getRepository(Topology::class)->findOneBy(
                ['context' => $context],
                ['createdAt' => 'ASC']
            );
        }

        return $this->json($topology ? $this->serialize($topology) : null);
    }

    #[Route('/inventory-fields', methods: ['GET'])]
    public function inventoryFields(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $categories = $em->getRepository(InventoryCategory::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        $rows = $em->createQuery(
            'SELECT DISTINCT e.categoryName, e.entryKey, e.colLabel
             FROM App\Entity\NodeInventoryEntry e
             JOIN e.node n
             WHERE n.context = :context'
        )->setParameter('context', $context)->getArrayResult();

        $keysByCat = [];
        $columnsByCat = [];
        foreach ($rows as $row) {
            $cat = $row['categoryName'];
            $keysByCat[$cat][$row['entryKey']] = true;
            $columnsByCat[$cat][$row['colLabel']] = true;
        }

        $build = function (?int $id, string $name) use (&$keysByCat, &$columnsByCat): array {
            $keys = array_keys($keysByCat[$name] ?? []);
            $cols = array_keys($columnsByCat[$name] ?? []);
            sort($keys);
            sort($cols);
            return ['id' => $id, 'name' => $name, 'keys' => $keys, 'columns' => $cols];
        };

        $result = [];
        $seen = [];
        foreach ($categories as $cat) {
            $result[] = $build($cat->getId(), $cat->getName());
            $seen[$cat->getName()] = true;
        }
        foreach (array_keys($keysByCat) as $catName) {
            if (!isset($seen[$catName])) {
                $result[] = $build(null, $catName);
            }
        }

        return $this->json($result);
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $existingCount = (int)$em->createQuery(
            'SELECT COUNT(t.id) FROM App\Entity\Topology t WHERE t.context = :context'
        )->setParameter('context', $context)->getSingleScalarResult();

        $topology = new Topology();
        $topology->setContext($context);
        $topology->setName($name);
        $topology->setDescription($data['description'] ?? null);
        $topology->setNodeDesign($data['nodeDesign'] ?? Topology::defaultNodeDesign());

        if (!empty($data['folderId'])) {
            $folder = $em->getRepository(TopologyFolder::class)->find($data['folderId']);
            if ($folder && $folder->getContext()->getId() === $context->getId()) {
                $topology->setFolder($folder);
            }
        }

        // First topology is primary by default.
        if ($existingCount === 0 || ($data['isPrimary'] ?? false)) {
            $this->clearPrimary($em, $context);
            $topology->setIsPrimary(true);
        }

        $em->persist($topology);
        $em->flush();

        return $this->json($this->serialize($topology, 0), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $count = (int)$em->createQuery(
            'SELECT COUNT(tn.id) FROM App\Entity\TopologyNode tn WHERE tn.topology = :t'
        )->setParameter('t', $topology)->getSingleScalarResult();

        return $this->json($this->serialize($topology, $count));
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $topology->setName($name);
        }
        if (array_key_exists('description', $data)) {
            $topology->setDescription($data['description']);
        }
        if (array_key_exists('folderId', $data)) {
            $folder = null;
            if (!empty($data['folderId'])) {
                $folder = $em->getRepository(TopologyFolder::class)->find($data['folderId']);
                if ($folder && $folder->getContext()->getId() !== $topology->getContext()->getId()) {
                    $folder = null;
                }
            }
            $topology->setFolder($folder);
        }
        if (array_key_exists('nodeDesign', $data) && is_array($data['nodeDesign'])) {
            $topology->setNodeDesign($data['nodeDesign']);
        }
        if (array_key_exists('layout', $data)) {
            $topology->setLayout(is_array($data['layout']) ? $data['layout'] : null);
        }
        if (array_key_exists('viewport', $data)) {
            $topology->setViewport(is_array($data['viewport']) ? $data['viewport'] : null);
        }
        if (array_key_exists('mapOptions', $data)) {
            $topology->setMapOptions(is_array($data['mapOptions']) ? $data['mapOptions'] : null);
        }

        $em->flush();
        return $this->json($this->serialize($topology));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $wasPrimary = $topology->isPrimary();
        $context = $topology->getContext();

        $em->remove($topology);
        $em->flush();

        // Promote another topology to primary if the deleted one was primary
        if ($wasPrimary) {
            $next = $em->getRepository(Topology::class)->findOneBy(
                ['context' => $context],
                ['createdAt' => 'ASC']
            );
            if ($next) {
                $next->setIsPrimary(true);
                $em->flush();
            }
        }

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/set-primary', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function setPrimary(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $this->clearPrimary($em, $topology->getContext());
        $topology->setIsPrimary(true);
        $em->flush();

        return $this->json($this->serialize($topology));
    }

    #[Route('/{id}/members', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function members(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $members = $em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);

        $result = [];
        foreach ($members as $m) {
            $n = $m->getNode();
            $result[] = [
                'id' => $m->getId(),
                'nodeId' => $n->getId(),
                'nodeName' => $n->getName(),
                'nodeIp' => method_exists($n, 'getIpAddress') ? $n->getIpAddress() : null,
                'styleOverride' => $m->getStyleOverride(),
            ];
        }
        return $this->json($result);
    }

    #[Route('/{id}/members', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function setMembers(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $nodeIds = array_values(array_unique(array_map('intval', $data['nodeIds'] ?? [])));

        $existing = $em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);
        $existingByNodeId = [];
        foreach ($existing as $m) {
            $existingByNodeId[$m->getNode()->getId()] = $m;
        }

        // Add new
        $context = $topology->getContext();
        foreach ($nodeIds as $nodeId) {
            if (isset($existingByNodeId[$nodeId])) {
                unset($existingByNodeId[$nodeId]);
                continue;
            }
            $node = $em->getRepository(Node::class)->find($nodeId);
            if (!$node || $node->getContext()->getId() !== $context->getId()) {
                continue;
            }
            $tn = new TopologyNode();
            $tn->setTopology($topology);
            $tn->setNode($node);
            $em->persist($tn);
        }

        // Remove leftovers
        foreach ($existingByNodeId as $m) {
            $em->remove($m);
        }

        $em->flush();

        return $this->members($id, $em);
    }

    #[Route('/{id}/edges', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listEdges(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $edges = $em->getRepository(TopologyEdge::class)->findBy(['topology' => $topology]);
        return $this->json(array_map(fn(TopologyEdge $e) => $this->serializeEdge($e), $edges));
    }

    #[Route('/{id}/edges', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createEdge(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $sourceId = (int)($data['sourceNodeId'] ?? 0);
        $targetId = (int)($data['targetNodeId'] ?? 0);
        if (!$sourceId || !$targetId || $sourceId === $targetId) {
            return $this->json(['error' => 'sourceNodeId and targetNodeId are required and must differ'], Response::HTTP_BAD_REQUEST);
        }

        $context = $topology->getContext();
        $source = $em->getRepository(Node::class)->find($sourceId);
        $target = $em->getRepository(Node::class)->find($targetId);
        if (!$source || !$target
            || $source->getContext()->getId() !== $context->getId()
            || $target->getContext()->getId() !== $context->getId()
        ) {
            return $this->json(['error' => 'Invalid source/target node'], Response::HTTP_BAD_REQUEST);
        }

        $edge = new TopologyEdge();
        $edge->setTopology($topology);
        $edge->setSourceNode($source);
        $edge->setTargetNode($target);
        $edge->setStyle($data['style'] ?? TopologyEdge::defaultStyle());

        $em->persist($edge);
        $em->flush();

        return $this->json($this->serializeEdge($edge), Response::HTTP_CREATED);
    }

    #[Route('/{topologyId}/edges/{edgeId}', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'edgeId' => '\d+'])]
    public function updateEdge(int $topologyId, int $edgeId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $edge = $em->getRepository(TopologyEdge::class)->find($edgeId);
        if (!$edge || $edge->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Edge not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $edge->getTopology());

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('sourceNodeId', $data) || array_key_exists('targetNodeId', $data)) {
            $context = $edge->getTopology()->getContext();
            if (array_key_exists('sourceNodeId', $data)) {
                $n = $em->getRepository(Node::class)->find((int)$data['sourceNodeId']);
                if (!$n || $n->getContext()->getId() !== $context->getId()) {
                    return $this->json(['error' => 'Invalid source node'], Response::HTTP_BAD_REQUEST);
                }
                $edge->setSourceNode($n);
            }
            if (array_key_exists('targetNodeId', $data)) {
                $n = $em->getRepository(Node::class)->find((int)$data['targetNodeId']);
                if (!$n || $n->getContext()->getId() !== $context->getId()) {
                    return $this->json(['error' => 'Invalid target node'], Response::HTTP_BAD_REQUEST);
                }
                $edge->setTargetNode($n);
            }
            if ($edge->getSourceNode()->getId() === $edge->getTargetNode()->getId()) {
                return $this->json(['error' => 'source and target must differ'], Response::HTTP_BAD_REQUEST);
            }
        }

        if (array_key_exists('style', $data) && is_array($data['style'])) {
            // Shallow-merge so a partial style update doesn't drop unrelated keys
            $edge->setStyle(array_merge($edge->getStyle(), $data['style']));
        }

        $em->flush();
        return $this->json($this->serializeEdge($edge));
    }

    #[Route('/{topologyId}/edges/{edgeId}', methods: ['DELETE'], requirements: ['topologyId' => '\d+', 'edgeId' => '\d+'])]
    public function deleteEdge(int $topologyId, int $edgeId, EntityManagerInterface $em): JsonResponse
    {
        $edge = $em->getRepository(TopologyEdge::class)->find($edgeId);
        if (!$edge || $edge->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Edge not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $edge->getTopology());

        $em->remove($edge);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function serializeEdge(TopologyEdge $e): array
    {
        return [
            'id' => $e->getId(),
            'sourceNodeId' => $e->getSourceNode()->getId(),
            'targetNodeId' => $e->getTargetNode()->getId(),
            'style' => $e->getStyle(),
            'protocolId' => $e->getProtocol()?->getId(),
            'createdAt' => $e->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function serializeProtocol(TopologyProtocol $p): array
    {
        return [
            'id' => $p->getId(),
            'name' => $p->getName(),
            'type' => $p->getType(),
            'inventoryCategoryId' => $p->getInventoryCategory()?->getId(),
            'inventoryCategoryName' => $p->getInventoryCategory()?->getName(),
            'mapping' => $p->getMapping(),
            'edgeStyle' => $p->getEdgeStyle(),
            'enabled' => $p->isEnabled(),
            'lastGeneratedAt' => $p->getLastGeneratedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    #[Route('/{id}/protocols', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listProtocols(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $protocols = $em->getRepository(TopologyProtocol::class)->findBy(['topology' => $topology], ['id' => 'ASC']);
        return $this->json(array_map(fn(TopologyProtocol $p) => $this->serializeProtocol($p), $protocols));
    }

    #[Route('/{id}/protocols', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createProtocol(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }
        $type = $data['type'] ?? TopologyProtocol::TYPE_LLDP;
        if (!in_array($type, TopologyProtocol::TYPES, true)) {
            return $this->json(['error' => 'Unsupported protocol type'], Response::HTTP_BAD_REQUEST);
        }

        $p = new TopologyProtocol();
        $p->setTopology($topology);
        $p->setName($name);
        $p->setType($type);
        $p->setMapping(array_merge(TopologyProtocol::defaultMapping(), is_array($data['mapping'] ?? null) ? $data['mapping'] : []));
        $p->setEdgeStyle(array_merge(TopologyProtocol::defaultEdgeStyle(), is_array($data['edgeStyle'] ?? null) ? $data['edgeStyle'] : []));
        $p->setEnabled($data['enabled'] ?? true);

        if (!empty($data['inventoryCategoryId'])) {
            $cat = $em->getRepository(InventoryCategory::class)->find((int)$data['inventoryCategoryId']);
            if ($cat && $cat->getContext()->getId() === $topology->getContext()->getId()) {
                $p->setInventoryCategory($cat);
            }
        }

        $em->persist($p);
        $em->flush();

        return $this->json($this->serializeProtocol($p), Response::HTTP_CREATED);
    }

    #[Route('/{topologyId}/protocols/{protocolId}', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'protocolId' => '\d+'])]
    public function updateProtocol(int $topologyId, int $protocolId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $p = $em->getRepository(TopologyProtocol::class)->find($protocolId);
        if (!$p || $p->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Protocol not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $p->getTopology());

        $data = json_decode($request->getContent(), true) ?? [];
        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $p->setName($name);
        }
        if (array_key_exists('enabled', $data)) {
            $p->setEnabled((bool)$data['enabled']);
        }
        if (array_key_exists('mapping', $data) && is_array($data['mapping'])) {
            $p->setMapping(array_merge($p->getMapping(), $data['mapping']));
        }
        if (array_key_exists('edgeStyle', $data) && is_array($data['edgeStyle'])) {
            $p->setEdgeStyle(array_merge($p->getEdgeStyle(), $data['edgeStyle']));
        }
        if (array_key_exists('inventoryCategoryId', $data)) {
            if ($data['inventoryCategoryId']) {
                $cat = $em->getRepository(InventoryCategory::class)->find((int)$data['inventoryCategoryId']);
                if ($cat && $cat->getContext()->getId() === $p->getTopology()->getContext()->getId()) {
                    $p->setInventoryCategory($cat);
                }
            } else {
                $p->setInventoryCategory(null);
            }
        }

        $em->flush();
        return $this->json($this->serializeProtocol($p));
    }

    #[Route('/{topologyId}/protocols/{protocolId}', methods: ['DELETE'], requirements: ['topologyId' => '\d+', 'protocolId' => '\d+'])]
    public function deleteProtocol(int $topologyId, int $protocolId, EntityManagerInterface $em): JsonResponse
    {
        $p = $em->getRepository(TopologyProtocol::class)->find($protocolId);
        if (!$p || $p->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Protocol not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $p->getTopology());

        // Cascade-detach edges generated by this protocol so they become manual edges.
        // (ON DELETE SET NULL would convert them anyway, but doing it explicitly keeps things tidy.)
        $em->createQuery('UPDATE App\Entity\TopologyEdge e SET e.protocol = NULL WHERE e.protocol = :p')
            ->setParameter('p', $p)->execute();

        $em->remove($p);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Regenerate edges from this protocol's inventory mapping.
     * Deletes existing edges produced by THIS protocol, leaves manual edges untouched.
     */
    #[Route('/{topologyId}/protocols/{protocolId}/generate', methods: ['POST'], requirements: ['topologyId' => '\d+', 'protocolId' => '\d+'])]
    public function generateProtocol(int $topologyId, int $protocolId, EntityManagerInterface $em): JsonResponse
    {
        $protocol = $em->getRepository(TopologyProtocol::class)->find($protocolId);
        if (!$protocol || $protocol->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Protocol not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $protocol->getTopology());

        $result = $this->runProtocolGeneration($protocol, $em);
        if ($result['error'] ?? null) {
            return $this->json(['error' => $result['error']], Response::HTTP_BAD_REQUEST);
        }
        return $this->json([
            'protocol' => $this->serializeProtocol($protocol),
            'stats' => $result['stats'],
        ]);
    }

    /**
     * Regenerate every enabled protocol of the topology. Used at map open to refresh links.
     * Protocols without a category or without destNodeColumn are silently skipped.
     */
    #[Route('/{id}/protocols/generate-all', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function generateAllProtocols(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $protocols = $em->getRepository(TopologyProtocol::class)->findBy([
            'topology' => $topology,
            'enabled' => true,
        ]);

        $results = [];
        foreach ($protocols as $p) {
            $r = $this->runProtocolGeneration($p, $em);
            $results[] = [
                'protocolId' => $p->getId(),
                'name' => $p->getName(),
                'error' => $r['error'] ?? null,
                'stats' => $r['stats'] ?? null,
            ];
        }

        return $this->json(['results' => $results]);
    }

    private function serializeClusterRule(TopologyClusterRule $r): array
    {
        return [
            'id' => $r->getId(),
            'name' => $r->getName(),
            'inventoryCategoryId' => $r->getInventoryCategory()?->getId(),
            'inventoryCategoryName' => $r->getInventoryCategory()?->getName(),
            'groupByColumn' => $r->getGroupByColumn(),
            'clusterStyle' => $r->getClusterStyle(),
            'enabled' => $r->isEnabled(),
            'lastGeneratedAt' => $r->getLastGeneratedAt()?->format(\DateTimeInterface::ATOM),
        ];
    }

    #[Route('/{id}/cluster-rules', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listClusterRules(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $rules = $em->getRepository(TopologyClusterRule::class)->findBy(['topology' => $topology], ['id' => 'ASC']);
        return $this->json(array_map(fn(TopologyClusterRule $r) => $this->serializeClusterRule($r), $rules));
    }

    #[Route('/{id}/cluster-rules', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createClusterRule(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $r = new TopologyClusterRule();
        $r->setTopology($topology);
        $r->setName($name);
        $r->setGroupByColumn((string)($data['groupByColumn'] ?? ''));
        $r->setClusterStyle(array_merge(TopologyCluster::defaultStyle(), is_array($data['clusterStyle'] ?? null) ? $data['clusterStyle'] : []));
        $r->setEnabled($data['enabled'] ?? true);

        if (!empty($data['inventoryCategoryId'])) {
            $cat = $em->getRepository(InventoryCategory::class)->find((int)$data['inventoryCategoryId']);
            if ($cat && $cat->getContext()->getId() === $topology->getContext()->getId()) {
                $r->setInventoryCategory($cat);
            }
        }

        $em->persist($r);
        $em->flush();
        return $this->json($this->serializeClusterRule($r), Response::HTTP_CREATED);
    }

    #[Route('/{topologyId}/cluster-rules/{ruleId}', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'ruleId' => '\d+'])]
    public function updateClusterRule(int $topologyId, int $ruleId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $r = $em->getRepository(TopologyClusterRule::class)->find($ruleId);
        if (!$r || $r->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Cluster rule not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $r->getTopology());

        $data = json_decode($request->getContent(), true) ?? [];
        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            $r->setName($name);
        }
        if (array_key_exists('enabled', $data)) $r->setEnabled((bool)$data['enabled']);
        if (array_key_exists('groupByColumn', $data)) $r->setGroupByColumn((string)$data['groupByColumn']);
        if (array_key_exists('clusterStyle', $data) && is_array($data['clusterStyle'])) {
            $r->setClusterStyle(array_merge($r->getClusterStyle(), $data['clusterStyle']));
        }
        if (array_key_exists('inventoryCategoryId', $data)) {
            if ($data['inventoryCategoryId']) {
                $cat = $em->getRepository(InventoryCategory::class)->find((int)$data['inventoryCategoryId']);
                if ($cat && $cat->getContext()->getId() === $r->getTopology()->getContext()->getId()) {
                    $r->setInventoryCategory($cat);
                }
            } else {
                $r->setInventoryCategory(null);
            }
        }
        $em->flush();
        return $this->json($this->serializeClusterRule($r));
    }

    #[Route('/{topologyId}/cluster-rules/{ruleId}', methods: ['DELETE'], requirements: ['topologyId' => '\d+', 'ruleId' => '\d+'])]
    public function deleteClusterRule(int $topologyId, int $ruleId, EntityManagerInterface $em): JsonResponse
    {
        $r = $em->getRepository(TopologyClusterRule::class)->find($ruleId);
        if (!$r || $r->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Cluster rule not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $r->getTopology());

        // Drop the clusters this rule produced — they're stale and no longer have an owner.
        $em->createQuery('DELETE FROM App\Entity\TopologyCluster c WHERE c.clusterRule = :r')
            ->setParameter('r', $r)->execute();

        $em->remove($r);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{topologyId}/cluster-rules/{ruleId}/generate', methods: ['POST'], requirements: ['topologyId' => '\d+', 'ruleId' => '\d+'])]
    public function generateClusterRule(int $topologyId, int $ruleId, EntityManagerInterface $em): JsonResponse
    {
        $rule = $em->getRepository(TopologyClusterRule::class)->find($ruleId);
        if (!$rule || $rule->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Cluster rule not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $rule->getTopology());

        $result = $this->runClusterRuleGeneration($rule, $em);
        if ($result['error'] ?? null) {
            return $this->json(['error' => $result['error']], Response::HTTP_BAD_REQUEST);
        }
        return $this->json([
            'rule' => $this->serializeClusterRule($rule),
            'stats' => $result['stats'],
        ]);
    }

    #[Route('/{id}/cluster-rules/generate-all', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function generateAllClusterRules(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $rules = $em->getRepository(TopologyClusterRule::class)->findBy(['topology' => $topology, 'enabled' => true]);
        $results = [];
        foreach ($rules as $r) {
            $res = $this->runClusterRuleGeneration($r, $em);
            $results[] = [
                'ruleId' => $r->getId(),
                'name' => $r->getName(),
                'error' => $res['error'] ?? null,
                'stats' => $res['stats'] ?? null,
            ];
        }
        return $this->json(['results' => $results]);
    }

    /**
     * Regenerate the clusters owned by one rule. Wipes the rule's previous
     * clusters, then groups every member node of the topology by its value in
     * the configured inventory column. A node missing that value (or with an
     * empty one) is simply not grouped. User-edited styles are preserved
     * across regenerations, keyed by cluster name.
     *
     * @return array{stats?: array{created:int, members:int}, error?: string}
     */
    private function runClusterRuleGeneration(TopologyClusterRule $rule, EntityManagerInterface $em): array
    {
        $category = $rule->getInventoryCategory();
        if (!$category) return ['error' => 'Cluster rule has no inventory category configured'];
        $column = $rule->getGroupByColumn();
        if ($column === '') return ['error' => 'Cluster rule has no groupByColumn configured'];

        $topology = $rule->getTopology();

        // Preserve user-customised styles (keyed by cluster name) across regen.
        $previous = $em->getRepository(TopologyCluster::class)->findBy(['clusterRule' => $rule]);
        $preservedStyles = [];
        foreach ($previous as $pc) $preservedStyles[$pc->getName()] = $pc->getStyle();
        $em->createQuery('DELETE FROM App\Entity\TopologyCluster c WHERE c.clusterRule = :r')
            ->setParameter('r', $rule)->execute();
        $em->flush();

        // Index member nodes
        $members = $em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);
        $nodeById = [];
        foreach ($members as $m) {
            $nodeById[$m->getNode()->getId()] = $m->getNode();
        }
        if (empty($nodeById)) return ['stats' => ['created' => 0, 'members' => 0]];

        // For every inventory entry on a member node in the chosen category +
        // column, accumulate the (value → set of node IDs) map. A node showing
        // multiple values across rows ends up in every matching cluster — that
        // matches how protocols already handle per-link area lists.
        $entries = $em->getRepository(NodeInventoryEntry::class)->findBy(['category' => $category]);
        $nodesByValue = []; // value => [nodeId => true]
        foreach ($entries as $e) {
            if ($e->getColLabel() !== $column) continue;
            $val = $e->getValue();
            if ($val === null || $val === '') continue;
            $nid = $e->getNode()->getId();
            if (!isset($nodeById[$nid])) continue;
            $nodesByValue[(string)$val][$nid] = true;
        }

        $created = 0;
        $totalMembers = 0;
        $defaultStyle = array_merge(TopologyCluster::defaultStyle(), $rule->getClusterStyle());
        ksort($nodesByValue);
        foreach ($nodesByValue as $value => $nodeIdMap) {
            $cluster = new TopologyCluster();
            $cluster->setTopology($topology);
            $cluster->setClusterRule($rule);
            $cluster->setName((string)$value);
            $cluster->setStyle(isset($preservedStyles[$value])
                ? array_merge($defaultStyle, $preservedStyles[$value])
                : $defaultStyle
            );
            $em->persist($cluster);
            $em->flush();

            foreach (array_keys($nodeIdMap) as $nid) {
                if (!isset($nodeById[$nid])) continue;
                $m = new TopologyClusterMember();
                $m->setCluster($cluster);
                $m->setNode($nodeById[$nid]);
                $em->persist($m);
                $totalMembers++;
            }
            $em->flush();
            $created++;
        }

        $rule->setLastGeneratedAt(new \DateTimeImmutable());
        $em->flush();
        return ['stats' => ['created' => $created, 'members' => $totalMembers]];
    }

    /**
     * Core protocol-generation routine. Dispatches by protocol type. Returns
     * ['stats' => [...]] on success or ['error' => 'message'] on bad config.
     */
    private function runProtocolGeneration(TopologyProtocol $protocol, EntityManagerInterface $em): array
    {
        $category = $protocol->getInventoryCategory();
        if (!$category) {
            return ['error' => 'Protocol has no inventory category configured'];
        }
        $mapping = $protocol->getMapping();
        $destCol = $mapping['destNodeColumn'] ?? null;
        if (!$destCol) {
            return ['error' => 'Protocol mapping is missing destNodeColumn'];
        }

        $topology = $protocol->getTopology();

        // Wipe previous edges for THIS protocol only
        $em->createQuery('DELETE FROM App\Entity\TopologyEdge e WHERE e.protocol = :p')
            ->setParameter('p', $protocol)->execute();
        $em->flush();

        // Index member nodes
        $members = $em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);
        $nodeById = [];
        $nodeByKey = []; // lowercase identifier => Node
        foreach ($members as $m) {
            $n = $m->getNode();
            $nodeById[$n->getId()] = $n;
            if ($n->getName())      $nodeByKey[strtolower($n->getName())] = $n;
            if ($n->getHostname())  $nodeByKey[strtolower($n->getHostname())] = $n;
            if ($n->getIpAddress()) $nodeByKey[strtolower($n->getIpAddress())] = $n;
        }

        // When the user pinpoints an inventory column for matching (e.g. a
        // chassis ID stored in inventory rather than on the Node itself), index
        // every value in that column to the owning Node. Falls back transparently
        // to the stock keys above when no inventory match is found.
        $matchInvCatId = $mapping['nodeMatchInventoryCategoryId'] ?? null;
        $matchInvKey = (string)($mapping['nodeMatchInventoryKey'] ?? '');
        $matchInvCol = $mapping['nodeMatchInventoryColumn'] ?? '';
        if (($mapping['nodeMatchField'] ?? 'auto') === 'inventory' && $matchInvCatId && $matchInvCol !== '') {
            $matchCat = $em->getRepository(InventoryCategory::class)->find((int)$matchInvCatId);
            if ($matchCat && !empty($nodeById)) {
                $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                    'category' => $matchCat,
                ]);
                foreach ($entries as $e) {
                    if ($e->getColLabel() !== $matchInvCol) continue;
                    if ($matchInvKey !== '' && (string)$e->getEntryKey() !== $matchInvKey) continue;
                    $val = $e->getValue();
                    if ($val === null || $val === '') continue;
                    $nid = $e->getNode()->getId();
                    if (!isset($nodeById[$nid])) continue;
                    $nodeByKey[strtolower((string)$val)] = $nodeById[$nid];
                }
            }
        }

        $style = array_merge(TopologyProtocol::defaultEdgeStyle(), $protocol->getEdgeStyle());

        $stats = ['created' => 0, 'skipped' => 0];

        switch ($protocol->getType()) {
            case TopologyProtocol::TYPE_ISIS:
                $this->generateIsisEdges($protocol, $mapping, $category, $style, $nodeById, $nodeByKey, $em, $stats);
                break;
            case TopologyProtocol::TYPE_STP:
                $this->generateStpEdges($protocol, $mapping, $category, $style, $nodeById, $nodeByKey, $em, $stats);
                break;
            case TopologyProtocol::TYPE_MSTP:
                $this->generateMstpEdges($protocol, $mapping, $category, $style, $nodeById, $nodeByKey, $em, $stats);
                break;
            default:
                $this->generateLldpEdges($protocol, $mapping, $category, $style, $nodeById, $nodeByKey, $em, $stats);
        }

        $protocol->setLastGeneratedAt(new \DateTimeImmutable());
        $em->flush();

        return ['stats' => $stats];
    }

    private function generateLldpEdges(
        TopologyProtocol $protocol, array $mapping, InventoryCategory $category, array $style,
        array $nodeById, array $nodeByKey, EntityManagerInterface $em, array &$stats,
    ): void {
        $destCol = $mapping['destNodeColumn'];
        $nodeMatchField = $mapping['nodeMatchField'] ?? 'auto';
        $localPortCol = $mapping['localPortColumn'] ?? '';
        $remotePortCol = $mapping['remotePortColumn'] ?? '';
        $metricCol = $mapping['metricColumn'] ?? '';
        $aggregationCategoryId = $mapping['aggregationCategoryId'] ?? null;
        $aggregationKeyCol = $mapping['aggregationKeyColumn'] ?? '';
        $aggregationValueCol = $mapping['aggregationValueColumn'] ?? '';
        $topology = $protocol->getTopology();

        // Per-node, per-port aggregation id (e.g. "Po1", "ae0"). The aggregation
        // lookup can target either the LLDP category itself or a dedicated category
        // (e.g. "Port-channel members") where each row keys a port and one column
        // holds the LAG id. We build a per-node map keyed by the port name so we
        // can look up BOTH ends of a link regardless of iteration direction.
        $aggregationByNodePort = [];
        if ($aggregationValueCol !== '') {
            $aggCategory = $aggregationCategoryId
                ? $em->getRepository(InventoryCategory::class)->find((int)$aggregationCategoryId)
                : $category;
            if ($aggCategory) {
                foreach ($nodeById as $nid => $node) {
                    $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                        'node' => $node,
                        'category' => $aggCategory,
                    ]);
                    foreach ($entries as $e) {
                        if ($e->getColLabel() !== $aggregationValueCol) { continue; }
                        $val = $e->getValue();
                        if ($val === null || $val === '') { continue; }
                        $aggregationByNodePort[$nid][(string)$e->getEntryKey()] = (string)$val;
                    }
                }
            }
        }

        // PASS 1 — collect every candidate half-edge.
        //
        // Each LLDP row describes one end of a physical link from the local
        // node's perspective. A single physical link typically yields TWO
        // candidates (one per side). Pass 2 then pairs the matching candidates
        // back into a single edge so that the rendered map reflects the
        // real-world cabling, not the directed LLDP table.
        $candidates = [];
        foreach ($nodeById as $sourceNodeId => $sourceNode) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $sourceNode,
                'category' => $category,
            ]);
            $byKey = [];
            foreach ($entries as $e) {
                $byKey[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
            }
            foreach ($byKey as $entryKey => $cols) {
                $remoteName = $cols[$destCol] ?? null;
                if (!$remoteName) { $stats['skipped']++; continue; }

                $target = $this->resolveTargetNode((string)$remoteName, $nodeMatchField, $nodeByKey, $nodeById);
                if (!$target) { $stats['skipped']++; continue; }
                if ($target->getId() === $sourceNodeId) { $stats['skipped']++; continue; }

                $localPort = ($localPortCol && isset($cols[$localPortCol])) ? (string)$cols[$localPortCol] : (string)$entryKey;
                $remotePort = ($remotePortCol && isset($cols[$remotePortCol])) ? (string)$cols[$remotePortCol] : '';
                $metric = ($metricCol && isset($cols[$metricCol]) && is_numeric($cols[$metricCol])) ? (int)$cols[$metricCol] : null;

                // Aggregation key on the LLDP row: optional override, defaults to the local port.
                $localAggKey = ($aggregationKeyCol && isset($cols[$aggregationKeyCol]) && $cols[$aggregationKeyCol] !== '')
                    ? (string)$cols[$aggregationKeyCol]
                    : $localPort;
                $localAgg = isset($aggregationByNodePort[$sourceNodeId][$localAggKey])
                    ? $aggregationByNodePort[$sourceNodeId][$localAggKey]
                    : null;
                $remoteAgg = ($remotePort !== '' && isset($aggregationByNodePort[$target->getId()][$remotePort]))
                    ? $aggregationByNodePort[$target->getId()][$remotePort]
                    : null;

                $candidates[] = [
                    'sourceNodeId' => $sourceNodeId,
                    'sourceNode' => $sourceNode,
                    'targetNodeId' => $target->getId(),
                    'targetNode' => $target,
                    'localPort' => $localPort,
                    'remotePort' => $remotePort,
                    'metric' => $metric,
                    'localAgg' => $localAgg,
                    'remoteAgg' => $remoteAgg,
                ];
            }
        }

        // PASS 2 — group candidates by undirected node pair and reconcile.
        $byPair = [];
        foreach ($candidates as $c) {
            $a = $c['sourceNodeId'];
            $b = $c['targetNodeId'];
            $pairKey = $a < $b ? "$a:$b" : "$b:$a";
            $byPair[$pairKey][] = $c;
        }

        foreach ($byPair as $pairKey => $pairCandidates) {
            [$minId, $maxId] = array_map('intval', explode(':', $pairKey));

            // Split into the two directed buckets so that we can pair entries
            // from min→max with their counterpart from max→min.
            $minToMax = [];
            $maxToMin = [];
            foreach ($pairCandidates as $c) {
                if ($c['sourceNodeId'] === $minId) {
                    $minToMax[] = $c;
                } else {
                    $maxToMin[] = $c;
                }
            }

            // Match each min→max candidate with the best-fit max→min candidate.
            // Best-fit uses available port info when present (strict match), else
            // falls back to positional pairing so a single physical link reported
            // from both sides without remote-port info still collapses to ONE edge.
            $matchedMaxIdx = [];
            foreach ($minToMax as $a) {
                $bestIdx = null;
                $bestScore = -1;
                foreach ($maxToMin as $idx => $b) {
                    if (isset($matchedMaxIdx[$idx])) continue;
                    // Strict mismatch: if both ports are known and disagree, skip.
                    if ($a['remotePort'] !== '' && $b['localPort'] !== '' && $a['remotePort'] !== $b['localPort']) {
                        continue;
                    }
                    if ($b['remotePort'] !== '' && $a['localPort'] !== '' && $b['remotePort'] !== $a['localPort']) {
                        continue;
                    }
                    // Higher score = more confidence in the pairing.
                    $score = 0;
                    if ($a['remotePort'] !== '' && $b['localPort'] !== '' && $a['remotePort'] === $b['localPort']) $score += 2;
                    if ($b['remotePort'] !== '' && $a['localPort'] !== '' && $b['remotePort'] === $a['localPort']) $score += 2;
                    if ($score > $bestScore) {
                        $bestScore = $score;
                        $bestIdx = $idx;
                    }
                }
                if ($bestIdx !== null) {
                    $matchedMaxIdx[$bestIdx] = true;
                    $this->persistLldpEdge($protocol, $topology, $a, $maxToMin[$bestIdx], $style, $em);
                    $stats['created']++;
                } else {
                    $this->persistLldpEdge($protocol, $topology, $a, null, $style, $em);
                    $stats['created']++;
                }
            }
            foreach ($maxToMin as $idx => $b) {
                if (isset($matchedMaxIdx[$idx])) continue;
                $this->persistLldpEdge($protocol, $topology, null, $b, $style, $em);
                $stats['created']++;
            }
        }
    }

    /**
     * Build one edge from a (min→max, max→min) candidate pair. Either side may
     * be null when LLDP visibility was asymmetric — the existing side then owns
     * the edge's source/target orientation and port labels.
     */
    private function persistLldpEdge(
        TopologyProtocol $protocol,
        Topology $topology,
        ?array $minSide,
        ?array $maxSide,
        array $style,
        EntityManagerInterface $em,
    ): void {
        // Default orientation: source = min node, target = max node when both
        // sides agree. If only one side exists, use that side's original
        // orientation so its localPort lands on the source.
        if ($minSide !== null) {
            $sourceNode = $minSide['sourceNode'];
            $targetNode = $minSide['targetNode'];
            $sourceLocalPort = $minSide['localPort'];
            $sourceRemotePort = $minSide['remotePort']; // (port on max from min's POV)
            $sourceMetric = $minSide['metric'];
            $sourceAggLocal = $minSide['localAgg'];
            $sourceAggRemote = $minSide['remoteAgg'];
        } else {
            $sourceNode = $maxSide['sourceNode'];
            $targetNode = $maxSide['targetNode'];
            $sourceLocalPort = $maxSide['localPort'];
            $sourceRemotePort = $maxSide['remotePort'];
            $sourceMetric = $maxSide['metric'];
            $sourceAggLocal = $maxSide['localAgg'];
            $sourceAggRemote = $maxSide['remoteAgg'];
        }

        // Reconcile labels: pick the strongest known port for each end.
        $portOnSource = $sourceLocalPort;
        $portOnTarget = $sourceRemotePort;
        if ($minSide !== null && $maxSide !== null) {
            // Min side localPort is authoritative for min end.
            $portOnSource = $minSide['localPort'] !== '' ? $minSide['localPort'] : ($maxSide['remotePort'] ?? '');
            // Max side localPort is authoritative for max end.
            $portOnTarget = $maxSide['localPort'] !== '' ? $maxSide['localPort'] : ($minSide['remotePort'] ?? '');
        }

        // Metric: prefer whichever side reports it.
        $metric = $sourceMetric;
        if ($metric === null && $maxSide !== null) {
            $metric = $maxSide['metric'];
        }

        // Aggregation: use whichever side has both ends, else fall back to a single side.
        $localAgg = $sourceAggLocal;
        $remoteAgg = $sourceAggRemote;
        if ($minSide !== null && $maxSide !== null) {
            $localAgg = $minSide['localAgg'];
            $remoteAgg = $maxSide['localAgg'];
        }

        $edge = new TopologyEdge();
        $edge->setTopology($topology);
        $edge->setSourceNode($sourceNode);
        $edge->setTargetNode($targetNode);
        $edge->setProtocol($protocol);

        $edgeStyle = $style;
        $labels = [];
        if ($portOnSource !== '') {
            $labels[] = ['text' => $portOnSource, 'position' => 'source', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
        }
        if ($portOnTarget !== '') {
            $labels[] = ['text' => $portOnTarget, 'position' => 'target', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
        }
        if (!empty($labels)) $edgeStyle['labels'] = $labels;
        if ($metric !== null) $edgeStyle['metric'] = $metric;

        if ($localAgg !== null && $remoteAgg !== null) {
            $edgeStyle['aggregationGroup'] = ($localAgg === $remoteAgg) ? $localAgg : "$localAgg/$remoteAgg";
        } elseif ($localAgg !== null) {
            $edgeStyle['aggregationGroup'] = $localAgg;
        } elseif ($remoteAgg !== null) {
            $edgeStyle['aggregationGroup'] = $remoteAgg;
        }

        $edge->setStyle($edgeStyle);
        $em->persist($edge);
    }

    /**
     * Generate ISIS links: bidirectional port matching + ISIS areas resolved
     * through a separate area inventory category. Each edge is auto-assigned
     * an aggregationGroup named after its primary area so that, with the
     * aggregation feature enabled, parallel area links collapse under one
     * capsule labeled by the area name.
     */
    private function generateIsisEdges(
        TopologyProtocol $protocol, array $mapping, InventoryCategory $category, array $style,
        array $nodeById, array $nodeByKey, EntityManagerInterface $em, array &$stats,
    ): void {
        $destCol = $mapping['destNodeColumn'];
        $nodeMatchField = $mapping['nodeMatchField'] ?? 'auto';
        $localPortCol = $mapping['localPortColumn'] ?? '';
        $metricCol = $mapping['metricColumn'] ?? '';
        $linkAreaCol = $mapping['linkAreaColumn'] ?? '';
        $areaCatId = $mapping['areaCategoryId'] ?? null;
        $areaCol = $mapping['areaColumn'] ?? '';
        $topology = $protocol->getTopology();

        // Per-node qualifier (e.g. HOME/REMOTE) → real area address
        $nodeQualifierToArea = [];
        if ($areaCatId && $areaCol) {
            $areaCategory = $em->getRepository(InventoryCategory::class)->find((int)$areaCatId);
            if ($areaCategory) {
                foreach ($nodeById as $nodeId => $node) {
                    $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                        'node' => $node,
                        'category' => $areaCategory,
                        'colLabel' => $areaCol,
                    ]);
                    foreach ($entries as $e) {
                        $val = $e->getValue();
                        if ($val !== null && $val !== '') {
                            $nodeQualifierToArea[$nodeId][$e->getEntryKey()] = (string)$val;
                        }
                    }
                }
            }
        }

        // Phase 1: collect directed adjacencies
        $directed = [];
        foreach ($nodeById as $sourceNodeId => $sourceNode) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $sourceNode,
                'category' => $category,
            ]);
            $byKey = [];
            foreach ($entries as $e) {
                $byKey[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
            }
            foreach ($byKey as $entryKey => $cols) {
                $remoteName = $cols[$destCol] ?? null;
                if (!$remoteName) { $stats['skipped']++; continue; }

                $target = $this->resolveTargetNode((string)$remoteName, $nodeMatchField, $nodeByKey, $nodeById);
                if (!$target) { $stats['skipped']++; continue; }
                if ($target->getId() === $sourceNodeId) { $stats['skipped']++; continue; }

                $localPort = ($localPortCol && isset($cols[$localPortCol])) ? (string)$cols[$localPortCol] : (string)$entryKey;
                $metric = ($metricCol && isset($cols[$metricCol]) && is_numeric($cols[$metricCol])) ? (int)$cols[$metricCol] : null;
                $rawQualifier = ($linkAreaCol && isset($cols[$linkAreaCol]) && $cols[$linkAreaCol] !== '') ? (string)$cols[$linkAreaCol] : null;

                // Resolve qualifier to real area
                $resolvedArea = null;
                if ($rawQualifier !== null) {
                    if (isset($nodeQualifierToArea[$sourceNodeId][$rawQualifier])) {
                        $resolvedArea = $nodeQualifierToArea[$sourceNodeId][$rawQualifier];
                    } elseif (!$areaCatId || !$areaCol) {
                        $resolvedArea = $rawQualifier;
                    }
                }

                $directed[] = [
                    'source' => $sourceNode,
                    'target' => $target,
                    'localPort' => $localPort,
                    'metric' => $metric,
                    'qualifier' => $rawQualifier,
                    'area' => $resolvedArea,
                ];
            }
        }

        // Merge directed entries that share (source, target, localPort) so an L1/L2
        // router showing one entry per qualifier collapses into a single adjacency
        // carrying both areas (HOME first, others after).
        $mergedKey = static fn(array $e): string =>
            $e['source']->getId() . ':' . $e['target']->getId() . ':' . (string)($e['localPort'] ?? '');
        $merged = [];
        foreach ($directed as $e) {
            $k = $mergedKey($e);
            if (!isset($merged[$k])) {
                $merged[$k] = $e + ['homeAreas' => [], 'otherAreas' => []];
                unset($merged[$k]['qualifier'], $merged[$k]['area']);
            } elseif ($merged[$k]['metric'] === null && $e['metric'] !== null) {
                $merged[$k]['metric'] = $e['metric'];
            }
            if (!empty($e['area'])) {
                $isHome = $e['qualifier'] !== null && strcasecmp((string)$e['qualifier'], 'HOME') === 0;
                $bucket = $isHome ? 'homeAreas' : 'otherAreas';
                if (!in_array($e['area'], $merged[$k][$bucket], true)) {
                    $merged[$k][$bucket][] = $e['area'];
                }
            }
        }

        $pickAreas = static function (?array $eAB, ?array $eBA): array {
            $ordered = [];
            $push = static function (?string $a) use (&$ordered) {
                if ($a !== null && $a !== '' && !in_array($a, $ordered, true)) $ordered[] = $a;
            };
            foreach (($eAB['homeAreas'] ?? []) as $a) $push($a);
            foreach (($eBA['homeAreas'] ?? []) as $a) $push($a);
            foreach (($eAB['otherAreas'] ?? []) as $a) $push($a);
            foreach (($eBA['otherAreas'] ?? []) as $a) $push($a);
            return $ordered;
        };

        // Phase 2: group merged entries by undirected node pair and match A→B with B→A
        $pairMap = [];
        foreach ($merged as $e) {
            $sId = $e['source']->getId();
            $tId = $e['target']->getId();
            $minId = min($sId, $tId);
            $maxId = max($sId, $tId);
            $key = "$minId:$maxId";
            $direction = ($sId <= $tId) ? 'ab' : 'ba';
            $pairMap[$key][$direction][] = $e;
        }

        // Collected per-area node memberships, used to recreate "zone" clusters after edge emission
        $nodesByArea = []; // areaName => [nodeId => true]

        $emit = function (Node $src, Node $tgt, ?string $portA, ?string $portB, ?int $metricSrc, ?int $metricTgt, array $areas) use ($em, $protocol, $topology, $style, &$stats, &$nodesByArea): void {
            $edge = new TopologyEdge();
            $edge->setTopology($topology);
            $edge->setSourceNode($src);
            $edge->setTargetNode($tgt);
            $edge->setProtocol($protocol);

            $edgeStyle = $style;
            $labels = [];
            if ($portA !== null && $portA !== '') {
                $labels[] = ['text' => $portA, 'position' => 'source', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
            }
            if ($portB !== null && $portB !== '') {
                $labels[] = ['text' => $portB, 'position' => 'target', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
            }

            // Cost labels (ISIS metric): one centered label if both sides agree (or only one
            // side reports it), two red labels — source and target — if they disagree.
            $hasS = $metricSrc !== null;
            $hasT = $metricTgt !== null;
            if ($hasS && $hasT && $metricSrc !== $metricTgt) {
                $labels[] = ['text' => (string)$metricSrc, 'position' => 'source', 'fontSize' => 6, 'color' => '#dc2626', 'fontWeight' => 700, 'offset' => 9];
                $labels[] = ['text' => (string)$metricTgt, 'position' => 'target', 'fontSize' => 6, 'color' => '#dc2626', 'fontWeight' => 700, 'offset' => 9];
            } elseif ($hasS || $hasT) {
                $cost = $hasS ? $metricSrc : $metricTgt;
                $labels[] = ['text' => (string)$cost, 'position' => 'middle', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 600];
            }

            if (!empty($labels)) $edgeStyle['labels'] = $labels;
            if ($hasS || $hasT) $edgeStyle['metric'] = $metricSrc ?? $metricTgt;

            // Tag the edge with the resolved area(s) for reference, but DON'T set an
            // aggregationGroup: zones (clusters) already represent the areas visually,
            // we don't want a per-link capsule on top.
            if (!empty($areas)) {
                $edgeStyle['isisAreas'] = $areas;
            }

            $edge->setStyle($edgeStyle);
            $em->persist($edge);
            $stats['created']++;

            // Track nodes belonging to each area for later cluster generation
            foreach ($areas as $area) {
                $nodesByArea[$area][$src->getId()] = true;
                $nodesByArea[$area][$tgt->getId()] = true;
            }
        };

        foreach ($pairMap as $sides) {
            $ab = $sides['ab'] ?? [];
            $ba = $sides['ba'] ?? [];
            $matched = [];

            foreach ($ab as $eAB) {
                $found = false;
                foreach ($ba as $i => $eBA) {
                    if (in_array($i, $matched, true)) continue;
                    $emit(
                        $eAB['source'], $eAB['target'],
                        $eAB['localPort'], $eBA['localPort'],
                        $eAB['metric'], $eBA['metric'],
                        $pickAreas($eAB, $eBA),
                    );
                    $matched[] = $i;
                    $found = true;
                    break;
                }
                if (!$found) {
                    $emit(
                        $eAB['source'], $eAB['target'],
                        $eAB['localPort'], null,
                        $eAB['metric'], null,
                        $pickAreas($eAB, null),
                    );
                }
            }
            foreach ($ba as $i => $eBA) {
                if (in_array($i, $matched, true)) continue;
                $emit(
                    $eBA['source'], $eBA['target'],
                    $eBA['localPort'], null,
                    $eBA['metric'], null,
                    $pickAreas(null, $eBA),
                );
            }
        }

        // Inventory is the source of truth for area membership: a node belongs to
        // every area declared in its own ISIS area inventory (typically HOME and any
        // REMOTE entries for L1/L2 routers). Edges alone miss the HOME area when a
        // router only adjacents into other areas (e.g. an inter-area-only L1/L2 hop).
        foreach ($nodeQualifierToArea as $nodeId => $qualifierMap) {
            foreach ($qualifierMap as $areaValue) {
                if ($areaValue === '' || $areaValue === null) continue;
                $nodesByArea[(string)$areaValue][$nodeId] = true;
            }
        }

        // Refresh "zone" clusters reflecting ISIS areas. Preserve previous styles
        // keyed by area name so user customizations (colors, label offset, etc.)
        // survive a regeneration; only fall back to defaults for brand-new areas.
        $existingClusters = $em->getRepository(TopologyCluster::class)->findBy(['protocol' => $protocol]);
        $preservedStyles = [];
        foreach ($existingClusters as $ec) {
            $preservedStyles[$ec->getName()] = $ec->getStyle();
        }
        $em->createQuery('DELETE FROM App\Entity\TopologyCluster c WHERE c.protocol = :p')
            ->setParameter('p', $protocol)->execute();
        $em->flush();

        $palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e'];
        $areaIdx = 0;
        foreach ($nodesByArea as $area => $nodeIdsMap) {
            $color = $palette[$areaIdx % count($palette)];
            $defaultStyle = [
                'shape' => 'hull',  // adaptive shape: circle / ellipse / convex hull
                'borderColor' => $color,
                'borderWidth' => 1,
                'dash' => 'dashed',
                'fillColor' => $color,
                'transparent' => false,
                'padding' => 30,
                'borderRadius' => 20,
                'labelPosition' => 'top',
                'labelFontSize' => 11,
                'labelColor' => $color,
                'labelOffset' => ['dx' => 0, 'dy' => 0],
            ];
            $cluster = new TopologyCluster();
            $cluster->setTopology($topology);
            $cluster->setProtocol($protocol);
            $cluster->setName((string)$area);
            $cluster->setStyle(isset($preservedStyles[$area])
                ? array_merge($defaultStyle, $preservedStyles[$area])
                : $defaultStyle
            );
            $em->persist($cluster);
            $em->flush();

            foreach (array_keys($nodeIdsMap) as $nodeId) {
                if (!isset($nodeById[$nodeId])) continue;
                $m = new TopologyClusterMember();
                $m->setCluster($cluster);
                $m->setNode($nodeById[$nodeId]);
                $em->persist($m);
            }
            $em->flush();
            $areaIdx++;
        }
    }

    /**
     * Generate STP (single-instance) edges. Each port row in the protocol's
     * primary category becomes a half-edge whose neighbor is resolved via the
     * "Designated Bridge" column matched against the Bridge ID column of a
     * separate bridge-identity category. Pairs of half-edges between the same
     * two devices collapse into one edge, and a TopologyCluster of size one is
     * emitted for the root bridge so the map renderer can crown it.
     */
    private function generateStpEdges(
        TopologyProtocol $protocol, array $mapping, InventoryCategory $category, array $style,
        array $nodeById, array $nodeByKey, EntityManagerInterface $em, array &$stats,
    ): void {
        $bridgeIndex = $this->buildStpBridgeIndex($mapping, $nodeById, $em, /* mstp */ false);
        $halfEdges = $this->collectStpHalfEdges(
            $protocol, $mapping, $category, $nodeById, $nodeByKey, $em, $bridgeIndex, /* mstp */ false, $stats,
        );
        $this->emitStpEdges($protocol, $style, $halfEdges, /* mstp */ false, $em, $stats);
        $this->emitStpRootClusters($protocol, $bridgeIndex, $nodeById, /* mstp */ false, $em);
    }

    /**
     * Generate MSTP edges. Same shape as generateStpEdges but each port row is
     * scoped to an instance ID (read from stpInstanceColumn or derived from the
     * entryKey suffix "port:instance"), bridge resolution is per-instance, and
     * one cluster per instance is emitted with its own root.
     */
    private function generateMstpEdges(
        TopologyProtocol $protocol, array $mapping, InventoryCategory $category, array $style,
        array $nodeById, array $nodeByKey, EntityManagerInterface $em, array &$stats,
    ): void {
        $bridgeIndex = $this->buildStpBridgeIndex($mapping, $nodeById, $em, /* mstp */ true);
        $halfEdges = $this->collectStpHalfEdges(
            $protocol, $mapping, $category, $nodeById, $nodeByKey, $em, $bridgeIndex, /* mstp */ true, $stats,
        );
        $this->emitStpEdges($protocol, $style, $halfEdges, /* mstp */ true, $em, $stats);
        $this->emitStpRootClusters($protocol, $bridgeIndex, $nodeById, /* mstp */ true, $em);
    }

    /**
     * Read the bridge-identity inventory and build:
     *   - bridgeIdToNode[instance][bridgeIdLower] = Node  (instance = "" for STP)
     *   - nodeBridgeId[nodeId][instance] = bridgeId
     *   - nodeRootId[nodeId][instance]   = rootId
     * For STP, the bridge category is expected to hold one row per device (any
     * entryKey, typically "default"). For MSTP, one row per (device × instance)
     * with entryKey = instance ID.
     */
    private function buildStpBridgeIndex(array $mapping, array $nodeById, EntityManagerInterface $em, bool $mstp): array
    {
        $bridgeCatId = $mapping['stpBridgeCategoryId'] ?? null;
        $bridgeCol = (string)($mapping['stpBridgeIdColumn'] ?? '');
        $rootCol = (string)($mapping['stpRootIdColumn'] ?? '');
        $idx = [
            'bridgeIdToNode' => [], // instance => [bridgeIdLower => Node]
            'nodeBridgeId' => [],   // nodeId => [instance => bridgeId]
            'nodeRootId' => [],     // nodeId => [instance => rootId]
        ];
        if (!$bridgeCatId || $bridgeCol === '') return $idx;
        $bridgeCat = $em->getRepository(InventoryCategory::class)->find((int)$bridgeCatId);
        if (!$bridgeCat) return $idx;

        foreach ($nodeById as $nid => $node) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $node,
                'category' => $bridgeCat,
            ]);
            $byKey = [];
            foreach ($entries as $e) {
                $byKey[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
            }
            foreach ($byKey as $entryKey => $cols) {
                $bridgeId = isset($cols[$bridgeCol]) ? trim((string)$cols[$bridgeCol]) : '';
                if ($bridgeId === '') continue;
                $rootId = ($rootCol !== '' && isset($cols[$rootCol])) ? trim((string)$cols[$rootCol]) : '';
                $instance = $mstp ? (string)$entryKey : '';
                $idx['bridgeIdToNode'][$instance][$this->normalizeBridgeId($bridgeId)] = $node;
                $idx['nodeBridgeId'][$nid][$instance] = $bridgeId;
                if ($rootId !== '') {
                    $idx['nodeRootId'][$nid][$instance] = $rootId;
                }
            }
        }
        return $idx;
    }

    /**
     * Collect STP/MSTP half-edges by crossing three independent inventory sources:
     *   1. Local identity (stpLocalCategoryId) — gives each device a value (hostname,
     *      chassis ID, …) that the device's LLDP neighbors will report as their
     *      "remote neighbor". Used to build a `value → Node` index.
     *   2. LLDP adjacencies (category — the protocol's primary inventoryCategoryId)
     *      — one row per local port with the remote neighbor ID and remote port.
     *      The remote neighbor is matched against (1) to find the target Node.
     *   3. Port state (stpStateCategoryId) — per-port, per-instance row holding
     *      State / Role / Cost. Keyed by port name on the device. MSTP multiplies
     *      adjacencies by instance: an LLDP adjacency on port "1/1" yields one
     *      half-edge per (port × instance) row found in state.
     *
     * Plain STP behaves as MSTP with a single empty-string instance.
     */
    private function collectStpHalfEdges(
        TopologyProtocol $protocol, array $mapping, InventoryCategory $category,
        array $nodeById, array $nodeByKey, EntityManagerInterface $em, array $bridgeIndex, bool $mstp, array &$stats,
    ): array {
        $destCol         = (string)($mapping['destNodeColumn'] ?? '');
        $localPortCol    = (string)($mapping['localPortColumn'] ?? '');
        $remotePortCol   = (string)($mapping['remotePortColumn'] ?? '');
        $metricCol       = (string)($mapping['metricColumn'] ?? '');
        $stateCol        = (string)($mapping['stpStateColumn'] ?? '');
        $roleCol         = (string)($mapping['stpRoleColumn'] ?? '');
        $instanceCol     = (string)($mapping['stpInstanceColumn'] ?? '');
        $priorityCol     = (string)($mapping['stpPriorityColumn'] ?? '');
        $localCatId      = $mapping['stpLocalCategoryId'] ?? null;
        $localEntryKey   = (string)($mapping['stpLocalEntryKey'] ?? '');
        $localCol        = (string)($mapping['stpLocalColumn'] ?? '');
        $stateCatId      = $mapping['stpStateCategoryId'] ?? null;
        $statePortCol    = (string)($mapping['stpStatePortColumn'] ?? '');

        // === 1. Local identity index ===
        // nodeByLocalId[lowercase(localValue)] = Node
        // localIdByNode[nodeId] = localValue (for debug / self-reference checks)
        $nodeByLocalId = [];
        $localIdByNode = [];
        if ($localCatId && $localCol !== '') {
            $localCat = $em->getRepository(InventoryCategory::class)->find((int)$localCatId);
            if ($localCat) {
                foreach ($nodeById as $nid => $node) {
                    $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                        'node' => $node,
                        'category' => $localCat,
                        'colLabel' => $localCol,
                    ]);
                    foreach ($entries as $e) {
                        if ($localEntryKey !== '' && (string)$e->getEntryKey() !== $localEntryKey) continue;
                        $val = trim((string)($e->getValue() ?? ''));
                        if ($val === '') continue;
                        $nodeByLocalId[strtolower($val)] = $node;
                        $localIdByNode[$nid] = $val;
                    }
                }
            }
        }

        // === 3. Port state index ===
        // stateByNodePort[nodeId][portLower][instance] = { state, role, cost }
        // Built FIRST so each LLDP adjacency can be exploded by instance.
        $stateByNodePort = [];
        if ($stateCatId) {
            $stateCat = $em->getRepository(InventoryCategory::class)->find((int)$stateCatId);
            if ($stateCat) {
                foreach ($nodeById as $nid => $node) {
                    $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                        'node' => $node,
                        'category' => $stateCat,
                    ]);
                    $byKey = [];
                    foreach ($entries as $e) {
                        $byKey[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
                    }
                    foreach ($byKey as $entryKey => $cols) {
                        // Port: stpStatePortColumn wins, else parse "port:instance"
                        // suffix off the entryKey, else use entryKey as-is.
                        $port = '';
                        if ($statePortCol !== '' && isset($cols[$statePortCol]) && $cols[$statePortCol] !== '') {
                            $port = (string)$cols[$statePortCol];
                        } elseif (str_contains((string)$entryKey, ':')) {
                            $port = (string)substr((string)$entryKey, 0, (int)strrpos((string)$entryKey, ':'));
                        } else {
                            $port = (string)$entryKey;
                        }
                        if ($port === '') continue;

                        // Instance: explicit column wins, else suffix "port:instance",
                        // else "" (plain STP).
                        $instance = '';
                        if ($instanceCol !== '' && isset($cols[$instanceCol]) && $cols[$instanceCol] !== '') {
                            $instance = trim((string)$cols[$instanceCol]);
                        } elseif (str_contains((string)$entryKey, ':')) {
                            $instance = trim((string)substr((string)$entryKey, (int)strrpos((string)$entryKey, ':') + 1));
                        }
                        if ($mstp && $instance === '') { continue; }

                        $stateByNodePort[$nid][strtolower($port)][$instance] = [
                            'state'    => $this->normalizeStpState(($stateCol !== '' && isset($cols[$stateCol])) ? trim((string)$cols[$stateCol]) : ''),
                            'role'     => ($roleCol !== '' && isset($cols[$roleCol])) ? trim((string)$cols[$roleCol]) : '',
                            'cost'     => ($metricCol !== '' && isset($cols[$metricCol]) && is_numeric($cols[$metricCol])) ? (int)$cols[$metricCol] : null,
                            'priority' => ($priorityCol !== '' && isset($cols[$priorityCol]) && is_numeric($cols[$priorityCol])) ? (int)$cols[$priorityCol] : null,
                        ];
                    }
                }
            }
        }

        // === 2. LLDP adjacencies + 3. cross with port state by instance ===
        $halfEdges = [];
        foreach ($nodeById as $sourceNodeId => $sourceNode) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $sourceNode,
                'category' => $category,
            ]);
            $byKey = [];
            foreach ($entries as $e) {
                $byKey[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
            }
            foreach ($byKey as $entryKey => $cols) {
                $remoteVal = ($destCol !== '' && isset($cols[$destCol])) ? trim((string)$cols[$destCol]) : '';
                if ($remoteVal === '') { $stats['skipped']++; continue; }

                $target = $nodeByLocalId[strtolower($remoteVal)] ?? null;
                if (!$target) { $stats['skipped']++; continue; }
                if ($target->getId() === $sourceNodeId) { $stats['skipped']++; continue; }

                $localPort = ($localPortCol !== '' && isset($cols[$localPortCol]) && $cols[$localPortCol] !== '')
                    ? (string)$cols[$localPortCol]
                    : (string)$entryKey;
                $remotePort = ($remotePortCol !== '' && isset($cols[$remotePortCol]) && $cols[$remotePortCol] !== '')
                    ? (string)$cols[$remotePortCol]
                    : '';

                // Port state lookup: emit one half-edge per (port × instance)
                // for MSTP, one for plain STP. When state info is missing for a
                // port, the adjacency is still emitted (state=unknown) so the
                // user gets the topology even if STP collection lagged behind.
                $statesForPort = $stateByNodePort[$sourceNodeId][strtolower($localPort)] ?? [];
                if (empty($statesForPort)) {
                    if ($mstp) {
                        // No state info: skip — MSTP edges are meaningless without
                        // an instance to attach them to.
                        $stats['skipped']++;
                        continue;
                    }
                    $statesForPort = ['' => ['state' => 'unknown', 'role' => '', 'cost' => null, 'priority' => null]];
                }
                foreach ($statesForPort as $instance => $st) {
                    $halfEdges[] = [
                        'sourceNodeId' => $sourceNodeId,
                        'sourceNode'   => $sourceNode,
                        'targetNodeId' => $target->getId(),
                        'targetNode'   => $target,
                        'localPort'    => $localPort,
                        'remotePort'   => $remotePort,
                        'instance'     => (string)$instance,
                        'state'        => (string)$st['state'],
                        'role'         => (string)$st['role'],
                        'cost'         => $st['cost'],
                        'priority'     => $st['priority'] ?? null,
                    ];
                    $stats['created']++;
                }
            }
        }
        // emitStpEdges() expects 'created' to count finalized edges, not half-edges.
        // Reset the running counter — it will be re-incremented per persisted edge.
        $stats['created'] = 0;
        return $halfEdges;
    }

    /**
     * Pair half-edges by undirected node pair (and instance for MSTP), then
     * persist one TopologyEdge per pair. The visual state is the "worst" of
     * both sides — a blocked port on either end means the link doesn't carry
     * traffic, even if the opposite side is forwarding.
     */
    private function emitStpEdges(
        TopologyProtocol $protocol, array $style, array $halfEdges, bool $mstp,
        EntityManagerInterface $em, array &$stats,
    ): void {
        $topology = $protocol->getTopology();

        // 1) Group half-edges by undirected node pair, kept in directed buckets
        //    (min-side / max-side). Two physical links A↔B with parallel ports
        //    (1/1↔1/1, 1/2↔1/2) produce 4 directed half-edges per instance —
        //    grouping by node pair only would collapse them into ONE edge,
        //    losing the parallel-link information. We need a second grouping
        //    pass by port pair before persisting.
        $byPair = [];
        foreach ($halfEdges as $h) {
            $a = $h['sourceNodeId'];
            $b = $h['targetNodeId'];
            $pairId = $a < $b ? "$a:$b" : "$b:$a";
            $dir = ($a < $b) ? 'min' : 'max';
            $byPair[$pairId][$dir][] = $h;
        }

        // 2) For each node pair, regroup half-edges by local port (collapsing
        //    instances), then match min-side ports to max-side ports using
        //    remotePort/localPort like generateLldpEdges does.
        foreach ($byPair as $pairId => $dirs) {
            $minByPort = [];
            $maxByPort = [];
            foreach (($dirs['min'] ?? []) as $h) {
                $minByPort[(string)$h['localPort']][] = $h;
            }
            foreach (($dirs['max'] ?? []) as $h) {
                $maxByPort[(string)$h['localPort']][] = $h;
            }

            // Match each min-side port to a max-side port. Strict on remotePort
            // when known; first compatible match wins.
            $matchedMax = [];
            foreach ($minByPort as $portMin => $halvesMin) {
                $remoteOnMaxSide = (string)($halvesMin[0]['remotePort'] ?? '');
                $bestPortMax = null;
                foreach ($maxByPort as $portMax => $halvesMax) {
                    if (isset($matchedMax[$portMax])) continue;
                    $remoteOnMinSide = (string)($halvesMax[0]['remotePort'] ?? '');
                    if ($remoteOnMaxSide !== '' && $portMax !== '' && $remoteOnMaxSide !== $portMax) continue;
                    if ($remoteOnMinSide !== '' && $portMin !== '' && $remoteOnMinSide !== $portMin) continue;
                    $bestPortMax = $portMax;
                    break;
                }
                if ($bestPortMax !== null) {
                    $matchedMax[$bestPortMax] = true;
                    $this->persistStpEdge($protocol, $topology, $halvesMin, $maxByPort[$bestPortMax], $style, $mstp, $em);
                } else {
                    $this->persistStpEdge($protocol, $topology, $halvesMin, [], $style, $mstp, $em);
                }
                $stats['created']++;
            }
            foreach ($maxByPort as $portMax => $halvesMax) {
                if (isset($matchedMax[$portMax])) continue;
                $this->persistStpEdge($protocol, $topology, [], $halvesMax, $style, $mstp, $em);
                $stats['created']++;
            }
        }
    }

    /**
     * Persist a single STP/MSTP edge from one physical port-pair.
     *   $minHalves : every half-edge collected on the min-id side of the pair
     *                (= all instances of the same local port). Empty if LLDP
     *                visibility was asymmetric.
     *   $maxHalves : same on the max-id side.
     * For MSTP, each instance is stamped onto edge.style.stpInstances. For STP
     * (single empty-string instance) we end up with one row in stpInstances
     * but also surface the aggregated stpState / stpStateLocal / stpStateRemote
     * directly on the edge style for legacy renderers.
     */
    private function persistStpEdge(
        TopologyProtocol $protocol, Topology $topology,
        array $minHalves, array $maxHalves, array $style, bool $mstp, EntityManagerInterface $em,
    ): void {
        if (empty($minHalves) && empty($maxHalves)) return;

        // Orientation: prefer min→max so source/target are deterministic across
        // regenerations. When only one side exists, use that side as source.
        if (!empty($minHalves)) {
            $sourceNode = $minHalves[0]['sourceNode'];
            $targetNode = $minHalves[0]['targetNode'];
            $portOnSource = (string)$minHalves[0]['localPort'];
            $portOnTarget = (string)(($maxHalves[0]['localPort'] ?? $minHalves[0]['remotePort'] ?? ''));
        } else {
            $sourceNode = $maxHalves[0]['sourceNode'];
            $targetNode = $maxHalves[0]['targetNode'];
            $portOnSource = (string)$maxHalves[0]['localPort'];
            $portOnTarget = (string)($maxHalves[0]['remotePort'] ?? '');
        }

        // Index instances by ID on each side so MSTP can pair states per-MSTI.
        $statesByInstanceMin = [];
        foreach ($minHalves as $h) {
            $statesByInstanceMin[(string)$h['instance']] = $h;
        }
        $statesByInstanceMax = [];
        foreach ($maxHalves as $h) {
            $statesByInstanceMax[(string)$h['instance']] = $h;
        }
        $allInstances = array_unique(array_merge(
            array_keys($statesByInstanceMin),
            array_keys($statesByInstanceMax),
        ));

        $instanceRows = [];
        $aggregateState = null;
        foreach ($allInstances as $instance) {
            $a = $statesByInstanceMin[$instance] ?? null;
            $b = $statesByInstanceMax[$instance] ?? null;
            $stateA = $a['state'] ?? null;
            $stateB = $b['state'] ?? null;
            $perInstanceState = $this->aggregateStpStates($stateA, $stateB);
            $instanceRows[] = [
                'instance'       => (string)$instance,
                'state'          => $perInstanceState,
                'stateLocal'     => $stateA,
                'stateRemote'    => $stateB,
                'roleLocal'      => $a['role'] ?? '',
                'roleRemote'     => $b['role'] ?? '',
                'cost'           => ($a['cost'] ?? null) ?? ($b['cost'] ?? null),
                'costLocal'      => $a['cost'] ?? null,
                'costRemote'     => $b['cost'] ?? null,
                'priorityLocal'  => $a['priority'] ?? null,
                'priorityRemote' => $b['priority'] ?? null,
            ];
            $aggregateState = $aggregateState === null
                ? $perInstanceState
                : $this->aggregateStpStates($aggregateState, $perInstanceState);
        }

        // Numeric-aware sort so MSTI 0,1,2,…,10 stays in order in the frontend.
        usort($instanceRows, static function ($x, $y) {
            $xn = is_numeric($x['instance']) ? (int)$x['instance'] : null;
            $yn = is_numeric($y['instance']) ? (int)$y['instance'] : null;
            if ($xn !== null && $yn !== null) return $xn <=> $yn;
            return strcmp((string)$x['instance'], (string)$y['instance']);
        });

        $edgeStyle = $this->applyStpStateStyle($style, $aggregateState ?? 'unknown');
        $edgeStyle['stpState'] = $aggregateState ?? 'unknown';
        if ($mstp) {
            $edgeStyle['stpInstances'] = $instanceRows;
        } else {
            $primary = $instanceRows[0] ?? null;
            if ($primary !== null) {
                if ($primary['stateLocal']  !== null) $edgeStyle['stpStateLocal']  = $primary['stateLocal'];
                if ($primary['stateRemote'] !== null) $edgeStyle['stpStateRemote'] = $primary['stateRemote'];
                if ($primary['roleLocal']   !== '')   $edgeStyle['stpRoleLocal']   = $primary['roleLocal'];
                if ($primary['roleRemote']  !== '')   $edgeStyle['stpRoleRemote']  = $primary['roleRemote'];
                if ($primary['cost']        !== null) $edgeStyle['metric']         = $primary['cost'];
            }
        }

        $labels = [];
        if ($portOnSource !== '') {
            $labels[] = ['text' => $portOnSource, 'position' => 'source', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
        }
        if ($portOnTarget !== '') {
            $labels[] = ['text' => $portOnTarget, 'position' => 'target', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
        }
        if (!$mstp) {
            $cost = $instanceRows[0]['cost'] ?? null;
            if ($cost !== null) {
                $labels[] = ['text' => (string)$cost, 'position' => 'middle', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 600];
            }
        }
        if (!empty($labels)) $edgeStyle['labels'] = $labels;

        $edge = new TopologyEdge();
        $edge->setTopology($topology);
        $edge->setSourceNode($sourceNode);
        $edge->setTargetNode($targetNode);
        $edge->setProtocol($protocol);
        $edge->setStyle($edgeStyle);
        $em->persist($edge);
    }

    /**
     * Drop and recreate one TopologyCluster per (instance, root) pair so the
     * map renderer can highlight the root bridge. Each cluster has exactly one
     * member: the root node. Cluster name follows "STP Root" / "MSTI <id> Root"
     * convention so the UI can pattern-match without inspecting style.
     */
    private function emitStpRootClusters(
        TopologyProtocol $protocol, array $bridgeIndex, array $nodeById, bool $mstp, EntityManagerInterface $em,
    ): void {
        $em->createQuery('DELETE FROM App\Entity\TopologyCluster c WHERE c.protocol = :p')
            ->setParameter('p', $protocol)->execute();
        $em->flush();

        $topology = $protocol->getTopology();
        // root[instance] = bridgeId (the most-frequently-reported root for that instance wins,
        // which makes the result resilient to one device with stale BPDU data)
        $rootByInstance = [];
        $rootVoteCount = []; // instance => bridgeId => votes
        foreach ($bridgeIndex['nodeRootId'] as $nid => $perInstance) {
            foreach ($perInstance as $instance => $rootId) {
                $key = $this->normalizeBridgeId($rootId);
                $rootVoteCount[$instance][$key] = ($rootVoteCount[$instance][$key] ?? 0) + 1;
            }
        }
        foreach ($rootVoteCount as $instance => $votes) {
            arsort($votes);
            $rootByInstance[$instance] = (string)array_key_first($votes);
        }

        $palette = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
        $idx = 0;
        foreach ($rootByInstance as $instance => $rootBridgeNorm) {
            $rootNode = $bridgeIndex['bridgeIdToNode'][$instance][$rootBridgeNorm] ?? null;
            if (!$rootNode || !isset($nodeById[$rootNode->getId()])) continue;

            $name = $mstp ? "MSTI $instance Root" : "STP Root";
            $color = $palette[$idx % count($palette)];
            $cluster = new TopologyCluster();
            $cluster->setTopology($topology);
            $cluster->setProtocol($protocol);
            $cluster->setName($name);
            $cluster->setStyle([
                'shape' => 'hull',
                'borderColor' => $color,
                'borderWidth' => 1.5,
                'dash' => 'solid',
                'fillColor' => $color,
                'transparent' => true,
                'padding' => 8,
                'borderRadius' => 14,
                'labelPosition' => 'top',
                'labelFontSize' => 10,
                'labelColor' => $color,
                'stpRoot' => true,
                'stpInstance' => $mstp ? (string)$instance : null,
            ]);
            $em->persist($cluster);
            $em->flush();

            $m = new TopologyClusterMember();
            $m->setCluster($cluster);
            $m->setNode($rootNode);
            $em->persist($m);
            $em->flush();
            $idx++;
        }
    }

    /**
     * Build a "value → Node" lookup index identical to the one runProtocolGeneration
     * builds globally, but parameterized. Used by the STP/MSTP 'lldp' neighbor
     * resolution mode to scope its match strategy to the LLDP side without
     * leaking it into the protocol's main mapping.
     */
    private function buildNodeIndex(
        array $nodeById,
        string $matchField,
        $matchInvCatId,
        string $matchInvKey,
        string $matchInvCol,
        EntityManagerInterface $em,
    ): array {
        $index = [];
        foreach ($nodeById as $n) {
            if ($n->getName())      $index[strtolower($n->getName())] = $n;
            if ($n->getHostname())  $index[strtolower($n->getHostname())] = $n;
            if ($n->getIpAddress()) $index[strtolower($n->getIpAddress())] = $n;
        }
        if ($matchField === 'inventory' && $matchInvCatId && $matchInvCol !== '') {
            $cat = $em->getRepository(InventoryCategory::class)->find((int)$matchInvCatId);
            if ($cat && !empty($nodeById)) {
                $entries = $em->getRepository(NodeInventoryEntry::class)->findBy(['category' => $cat]);
                foreach ($entries as $e) {
                    if ($e->getColLabel() !== $matchInvCol) continue;
                    if ($matchInvKey !== '' && (string)$e->getEntryKey() !== $matchInvKey) continue;
                    $val = $e->getValue();
                    if ($val === null || $val === '') continue;
                    $nid = $e->getNode()->getId();
                    if (!isset($nodeById[$nid])) continue;
                    $index[strtolower((string)$val)] = $nodeById[$nid];
                }
            }
        }
        return $index;
    }

    /**
     * Normalize a Bridge ID to its bare MAC (last 6 bytes) so values from
     * different vendors / commands collapse to the same key. Bridge IDs come
     * in two shapes:
     *   - prefixed with priority: "8000.aabb.cc00.0001" (Cisco) or
     *     "80:00:0c:1c:9e:c8:00:00" (VOSS "DESIGNATED ROOT") — 8 bytes total
     *   - bare MAC: "0c:2d:3d:ab:00:00" (VOSS "BRIDGE ADDRESS") — 6 bytes
     * Stripping non-hex chars then keeping the last 12 hex digits yields the
     * MAC in every case — that's the only stable identity across MSTIs
     * (priority can differ per instance, the MAC doesn't).
     */
    private function normalizeBridgeId(string $v): string
    {
        $s = strtolower(trim($v));
        $s = preg_replace('/[^0-9a-f]/', '', $s) ?? $s;
        if ($s === '') return '';
        return strlen($s) > 12 ? substr($s, -12) : $s;
    }

    /** Map free-text state values to a small canonical set used for styling. */
    private function normalizeStpState(string $v): string
    {
        $s = strtolower(trim($v));
        if ($s === '') return 'unknown';
        if (str_contains($s, 'forward') || $s === 'fwd' || $s === 'forwarding') return 'forwarding';
        if (str_contains($s, 'block') || $s === 'blk' || $s === 'blocking') return 'blocking';
        if (str_contains($s, 'discard') || $s === 'dis') return 'discarding';
        if (str_contains($s, 'learn')) return 'learning';
        if (str_contains($s, 'listen')) return 'listening';
        if (str_contains($s, 'disabled') || str_contains($s, 'down')) return 'disabled';
        return 'unknown';
    }

    /** "Worst" state wins: blocking/discarding beats learning/listening beats forwarding. */
    private function aggregateStpStates(?string $a, ?string $b): string
    {
        $rank = [
            'blocking' => 5, 'discarding' => 5,
            'learning' => 4, 'listening' => 4,
            'disabled' => 3,
            'unknown' => 2,
            'forwarding' => 1,
        ];
        $candidates = array_filter([$a, $b], static fn($v) => $v !== null && $v !== '');
        if (empty($candidates)) return 'unknown';
        if (count($candidates) === 1) return reset($candidates);
        // If the two sides disagree (one forwarding, one blocking), flag as mixed.
        if (count(array_unique($candidates)) > 1) {
            $maxRank = 0;
            $maxState = 'unknown';
            foreach ($candidates as $c) {
                $r = $rank[$c] ?? 0;
                if ($r > $maxRank) { $maxRank = $r; $maxState = $c; }
            }
            return $maxRank >= 5 ? $maxState : 'mixed';
        }
        return reset($candidates);
    }

    /**
     * Pick a default colour + dash for an STP state. The user's edgeStyle
     * still wins (we merge it on top), so a custom palette in the wizard
     * keeps working; but a freshly generated edge has sensible state colours
     * out of the box.
     */
    private function applyStpStateStyle(array $baseStyle, string $state): array
    {
        $palette = [
            'forwarding' => ['color' => '#22c55e', 'dash' => 'solid'],
            'learning'   => ['color' => '#f59e0b', 'dash' => 'dashed'],
            'listening'  => ['color' => '#fbbf24', 'dash' => 'dashed'],
            'blocking'   => ['color' => '#ef4444', 'dash' => 'dotted'],
            'discarding' => ['color' => '#ef4444', 'dash' => 'dotted'],
            'disabled'   => ['color' => '#94a3b8', 'dash' => 'dotted'],
            'mixed'      => ['color' => '#f97316', 'dash' => 'dashed'],
            'unknown'    => null,
        ];
        $override = $palette[$state] ?? null;
        if (!$override) return $baseStyle;
        // baseStyle already has user-chosen color/dash from the wizard's Style
        // step. Only auto-fill when those are still at the indigo-ish default,
        // so a deliberate user choice survives a regeneration.
        $isDefaultColor = !isset($baseStyle['color']) || in_array(strtolower($baseStyle['color']), ['#6366f1', '#94a3b8'], true);
        $isDefaultDash = !isset($baseStyle['dash']) || $baseStyle['dash'] === 'solid';
        if ($isDefaultColor) $baseStyle['color'] = $override['color'];
        if ($isDefaultDash) $baseStyle['dash'] = $override['dash'];
        return $baseStyle;
    }

    private function stripInstanceSuffix(string $entryKey, string $instance): string
    {
        if ($instance === '' || !str_ends_with($entryKey, ':' . $instance)) {
            return $entryKey;
        }
        return substr($entryKey, 0, -strlen(':' . $instance));
    }

    private function resolveTargetNode(
        string $destValue,
        string $nodeMatchField,
        array &$nodeByKey,
        array &$nodeById,
    ): ?Node {
        $lower = strtolower($destValue);

        // auto + inventory both rely on the pre-built $nodeByKey index — for
        // inventory, runProtocolGeneration already injected the values from the
        // chosen category/column into the key map.
        if ($nodeMatchField === 'auto' || $nodeMatchField === 'inventory') {
            return $nodeByKey[$lower] ?? null;
        }

        foreach ($nodeById as $n) {
            $val = match ($nodeMatchField) {
                'name' => $n->getName(),
                'hostname' => $n->getHostname(),
                'ipAddress' => $n->getIpAddress(),
                default => null,
            };
            if ($val && strtolower($val) === $lower) {
                return $n;
            }
        }
        return $nodeByKey[$lower] ?? null;
    }

    private function serializeAnnotation(TopologyAnnotation $a): array
    {
        return [
            'id' => $a->getId(),
            'type' => $a->getType(),
            'x' => $a->getX(),
            'y' => $a->getY(),
            'width' => $a->getWidth(),
            'height' => $a->getHeight(),
            'rotation' => $a->getRotation(),
            'zIndex' => $a->getZIndex(),
            'data' => $a->getData(),
        ];
    }

    #[Route('/{id}/annotations', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listAnnotations(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $annotations = $em->getRepository(TopologyAnnotation::class)->findBy(
            ['topology' => $topology],
            ['zIndex' => 'ASC', 'id' => 'ASC']
        );
        return $this->json(array_map(fn(TopologyAnnotation $a) => $this->serializeAnnotation($a), $annotations));
    }

    #[Route('/{id}/annotations', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createAnnotation(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $type = $data['type'] ?? TopologyAnnotation::TYPE_TEXT;
        if (!in_array($type, [TopologyAnnotation::TYPE_TEXT, TopologyAnnotation::TYPE_IMAGE, TopologyAnnotation::TYPE_SHAPE], true)) {
            return $this->json(['error' => 'Invalid type'], Response::HTTP_BAD_REQUEST);
        }

        $a = new TopologyAnnotation();
        $a->setTopology($topology);
        $a->setType($type);
        if (isset($data['x'])) $a->setX((float)$data['x']);
        if (isset($data['y'])) $a->setY((float)$data['y']);
        if (isset($data['width'])) $a->setWidth((float)$data['width']);
        if (isset($data['height'])) $a->setHeight((float)$data['height']);
        if (isset($data['rotation'])) $a->setRotation((float)$data['rotation']);
        if (isset($data['zIndex'])) $a->setZIndex((int)$data['zIndex']);
        $payload = is_array($data['data'] ?? null) ? $data['data'] : [];
        $a->setData(array_merge(TopologyAnnotation::defaultDataFor($type), $payload));

        $em->persist($a);
        $em->flush();

        return $this->json($this->serializeAnnotation($a), Response::HTTP_CREATED);
    }

    #[Route('/{topologyId}/annotations/{annotationId}', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'annotationId' => '\d+'])]
    public function updateAnnotation(int $topologyId, int $annotationId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $a = $em->getRepository(TopologyAnnotation::class)->find($annotationId);
        if (!$a || $a->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Annotation not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $a->getTopology());

        $data = json_decode($request->getContent(), true) ?? [];
        if (array_key_exists('x', $data)) $a->setX((float)$data['x']);
        if (array_key_exists('y', $data)) $a->setY((float)$data['y']);
        if (array_key_exists('width', $data)) $a->setWidth((float)$data['width']);
        if (array_key_exists('height', $data)) $a->setHeight((float)$data['height']);
        if (array_key_exists('rotation', $data)) $a->setRotation((float)$data['rotation']);
        if (array_key_exists('zIndex', $data)) $a->setZIndex((int)$data['zIndex']);
        if (array_key_exists('data', $data) && is_array($data['data'])) {
            $a->setData(array_merge($a->getData(), $data['data']));
        }
        $em->flush();
        return $this->json($this->serializeAnnotation($a));
    }

    #[Route('/{topologyId}/annotations/{annotationId}', methods: ['DELETE'], requirements: ['topologyId' => '\d+', 'annotationId' => '\d+'])]
    public function deleteAnnotation(int $topologyId, int $annotationId, EntityManagerInterface $em): JsonResponse
    {
        $a = $em->getRepository(TopologyAnnotation::class)->find($annotationId);
        if (!$a || $a->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Annotation not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $a->getTopology());

        $em->remove($a);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function serializeCluster(TopologyCluster $c, array $memberNodeIds): array
    {
        return [
            'id' => $c->getId(),
            'name' => $c->getName(),
            'style' => $c->getStyle(),
            'nodeIds' => array_values($memberNodeIds),
            'protocolId' => $c->getProtocol()?->getId(),
            'createdAt' => $c->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function loadClusterMembers(EntityManagerInterface $em, array $clusters): array
    {
        if (empty($clusters)) return [];
        $rows = $em->createQuery(
            'SELECT IDENTITY(m.cluster) AS clusterId, IDENTITY(m.node) AS nodeId
             FROM App\Entity\TopologyClusterMember m
             WHERE m.cluster IN (:clusters)'
        )->setParameter('clusters', $clusters)->getArrayResult();
        $byCluster = [];
        foreach ($rows as $row) {
            $byCluster[(int)$row['clusterId']][] = (int)$row['nodeId'];
        }
        return $byCluster;
    }

    #[Route('/{id}/clusters', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listClusters(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $clusters = $em->getRepository(TopologyCluster::class)->findBy(['topology' => $topology], ['id' => 'ASC']);
        $membersByCluster = $this->loadClusterMembers($em, $clusters);

        return $this->json(array_map(
            fn(TopologyCluster $c) => $this->serializeCluster($c, $membersByCluster[$c->getId()] ?? []),
            $clusters
        ));
    }

    #[Route('/{id}/clusters', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createCluster(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $cluster = new TopologyCluster();
        $cluster->setTopology($topology);
        $cluster->setName($name);
        $cluster->setStyle(isset($data['style']) && is_array($data['style'])
            ? array_merge(TopologyCluster::defaultStyle(), $data['style'])
            : TopologyCluster::defaultStyle()
        );
        $em->persist($cluster);
        $em->flush();

        $nodeIds = [];
        if (is_array($data['nodeIds'] ?? null)) {
            $nodeIds = $this->syncClusterMembers($em, $cluster, $data['nodeIds']);
        }

        return $this->json($this->serializeCluster($cluster, $nodeIds), Response::HTTP_CREATED);
    }

    #[Route('/{topologyId}/clusters/{clusterId}', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'clusterId' => '\d+'])]
    public function updateCluster(int $topologyId, int $clusterId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $cluster = $em->getRepository(TopologyCluster::class)->find($clusterId);
        if (!$cluster || $cluster->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Cluster not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $cluster->getTopology());

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $cluster->setName($name);
        }
        if (array_key_exists('style', $data) && is_array($data['style'])) {
            $cluster->setStyle(array_merge($cluster->getStyle(), $data['style']));
        }
        if (array_key_exists('nodeIds', $data) && is_array($data['nodeIds'])) {
            $this->syncClusterMembers($em, $cluster, $data['nodeIds']);
        }
        $em->flush();

        $members = $this->loadClusterMembers($em, [$cluster]);
        return $this->json($this->serializeCluster($cluster, $members[$cluster->getId()] ?? []));
    }

    #[Route('/{topologyId}/clusters/{clusterId}', methods: ['DELETE'], requirements: ['topologyId' => '\d+', 'clusterId' => '\d+'])]
    public function deleteCluster(int $topologyId, int $clusterId, EntityManagerInterface $em): JsonResponse
    {
        $cluster = $em->getRepository(TopologyCluster::class)->find($clusterId);
        if (!$cluster || $cluster->getTopology()->getId() !== $topologyId) {
            return $this->json(['error' => 'Cluster not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $cluster->getTopology());

        $em->remove($cluster);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * @return int[] Final list of node ids in the cluster.
     */
    private function syncClusterMembers(EntityManagerInterface $em, TopologyCluster $cluster, array $rawNodeIds): array
    {
        $context = $cluster->getTopology()->getContext();
        $nodeIds = array_values(array_unique(array_map('intval', $rawNodeIds)));

        $existing = $em->getRepository(TopologyClusterMember::class)->findBy(['cluster' => $cluster]);
        $existingByNodeId = [];
        foreach ($existing as $m) {
            $existingByNodeId[$m->getNode()->getId()] = $m;
        }

        $final = [];
        foreach ($nodeIds as $nodeId) {
            if (isset($existingByNodeId[$nodeId])) {
                $final[] = $nodeId;
                unset($existingByNodeId[$nodeId]);
                continue;
            }
            $node = $em->getRepository(Node::class)->find($nodeId);
            if (!$node || $node->getContext()->getId() !== $context->getId()) {
                continue;
            }
            $m = new TopologyClusterMember();
            $m->setCluster($cluster);
            $m->setNode($node);
            $em->persist($m);
            $final[] = $nodeId;
        }
        foreach ($existingByNodeId as $m) {
            $em->remove($m);
        }
        $em->flush();
        return $final;
    }

    #[Route('/{id}/svg', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function svg(int $id, Request $request, EntityManagerInterface $em, \App\Service\TopologyV2SvgRenderer $renderer): Response
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $protocolFilter = $request->query->get('protocolFilter', 'manual');
        if ($protocolFilter !== 'manual' && ctype_digit($protocolFilter)) {
            $protocolFilter = (int)$protocolFilter;
        }
        $opts = [
            'protocolFilter' => $protocolFilter,
            'canvasWidth' => (int)$request->query->get('width', 1200),
            'showClusters' => $request->query->getBoolean('clusters', true),
            'showAnnotations' => $request->query->getBoolean('annotations', true),
        ];
        $mstpInstance = $request->query->get('mstpInstance');
        if ($mstpInstance !== null && $mstpInstance !== '') {
            $opts['mstpInstance'] = (string) $mstpInstance;
        }
        // Legend is opt-in via the query string. Default false matches how the
        // structure-editor preview is meant to look — clean map, no legend.
        $opts['showLegend'] = $request->query->getBoolean('showLegend', false);
        $vf = $request->query->get('viewportFrame');
        if (is_string($vf) && $vf !== '') {
            $parts = array_map('floatval', explode(',', $vf));
            if (count($parts) === 4) {
                $opts['viewportFrame'] = ['x' => $parts[0], 'y' => $parts[1], 'width' => $parts[2], 'height' => $parts[3]];
            }
        }
        $svg = $renderer->render($topology, $opts);
        $response = new Response($svg);
        $response->headers->set('Content-Type', 'image/svg+xml');
        return $response;
    }

    #[Route('/{id}/graph', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function graph(int $id, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($id);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $members = $em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);
        $nodeIds = array_map(fn(TopologyNode $m) => $m->getNode()->getId(), $members);

        $inventoryByNode = [];
        if (!empty($nodeIds)) {
            $rows = $em->createQuery(
                'SELECT IDENTITY(e.node) AS nodeId, e.categoryName, e.entryKey, e.colLabel, e.value
                 FROM App\Entity\NodeInventoryEntry e
                 WHERE e.node IN (:nodes)'
            )->setParameter('nodes', $nodeIds)->getArrayResult();
            foreach ($rows as $row) {
                $inventoryByNode[(int)$row['nodeId']][$row['categoryName']][$row['entryKey']][$row['colLabel']] = $row['value'];
            }
        }

        $layout = $topology->getLayout() ?? [];
        $nodes = [];
        foreach ($members as $m) {
            $n = $m->getNode();
            $nodeId = $n->getId();
            $pos = $layout[(string)$nodeId] ?? null;
            $nodes[] = [
                'nodeId' => $nodeId,
                'name' => $n->getName(),
                'hostname' => $n->getHostname(),
                'ipAddress' => $n->getIpAddress(),
                'manufacturer' => $n->getManufacturer()?->getName(),
                'model' => $n->getModel()?->getName(),
                'complianceScore' => $n->getComplianceScore(),
                'isReachable' => $n->getIsReachable(),
                'styleOverride' => $m->getStyleOverride(),
                'inventory' => $inventoryByNode[$nodeId] ?? new \stdClass(),
                'position' => $pos,
            ];
        }

        $edges = $em->getRepository(TopologyEdge::class)->findBy(['topology' => $topology]);
        $clusters = $em->getRepository(TopologyCluster::class)->findBy(['topology' => $topology]);
        $clusterMembers = $this->loadClusterMembers($em, $clusters);
        $annotations = $em->getRepository(TopologyAnnotation::class)->findBy(
            ['topology' => $topology],
            ['zIndex' => 'ASC', 'id' => 'ASC']
        );
        $protocols = $em->getRepository(TopologyProtocol::class)->findBy(['topology' => $topology], ['id' => 'ASC']);

        return $this->json([
            'topology' => $this->serialize($topology, count($members)),
            'nodes' => $nodes,
            'edges' => array_map(fn(TopologyEdge $e) => $this->serializeEdge($e), $edges),
            'clusters' => array_map(
                fn(TopologyCluster $c) => $this->serializeCluster($c, $clusterMembers[$c->getId()] ?? []),
                $clusters
            ),
            'annotations' => array_map(fn(TopologyAnnotation $a) => $this->serializeAnnotation($a), $annotations),
            'protocols' => array_map(fn(TopologyProtocol $p) => [
                'id' => $p->getId(),
                'name' => $p->getName(),
                'type' => $p->getType(),
            ], $protocols),
            'clusterRules' => array_map(fn(TopologyClusterRule $r) => [
                'id' => $r->getId(),
                'name' => $r->getName(),
            ], $em->getRepository(TopologyClusterRule::class)->findBy(['topology' => $topology], ['id' => 'ASC'])),
        ]);
    }

    #[Route('/{topologyId}/nodes/{nodeId}/style', methods: ['PUT'], requirements: ['topologyId' => '\d+', 'nodeId' => '\d+'])]
    public function setNodeStyle(int $topologyId, int $nodeId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $topology = $em->getRepository(Topology::class)->find($topologyId);
        if (!$topology) {
            return $this->json(['error' => 'Topology not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $topology);

        $member = $em->getRepository(TopologyNode::class)->findOneBy([
            'topology' => $topology,
            'node' => $nodeId,
        ]);
        if (!$member) {
            return $this->json(['error' => 'Node is not a member of this topology'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true);
        $member->setStyleOverride(is_array($data) ? $data : null);
        $em->flush();

        return $this->json([
            'nodeId' => $nodeId,
            'styleOverride' => $member->getStyleOverride(),
        ]);
    }

    private function clearPrimary(EntityManagerInterface $em, Context $context): void
    {
        $em->createQuery(
            'UPDATE App\Entity\Topology t SET t.isPrimary = false WHERE t.context = :ctx AND t.isPrimary = true'
        )->setParameter('ctx', $context)->execute();
    }
}

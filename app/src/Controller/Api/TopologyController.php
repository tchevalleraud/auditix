<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\InventoryCategory;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\Topology;
use App\Entity\TopologyAnnotation;
use App\Entity\TopologyCluster;
use App\Entity\TopologyClusterMember;
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

        $style = array_merge(TopologyProtocol::defaultEdgeStyle(), $protocol->getEdgeStyle());

        $stats = ['created' => 0, 'skipped' => 0];

        if ($protocol->getType() === TopologyProtocol::TYPE_ISIS) {
            $this->generateIsisEdges($protocol, $mapping, $category, $style, $nodeById, $nodeByKey, $em, $stats);
        } else {
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
        $topology = $protocol->getTopology();
        $createdKeys = [];

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

                $sId = $sourceNodeId;
                $tId = $target->getId();
                $minId = min($sId, $tId);
                $maxId = max($sId, $tId);
                $portA = ($sId <= $tId) ? $localPort : $remotePort;
                $portB = ($sId <= $tId) ? $remotePort : $localPort;
                $key = "$minId:$maxId:$portA:$portB";
                if (isset($createdKeys[$key])) { continue; }
                $createdKeys[$key] = true;

                $edge = new TopologyEdge();
                $edge->setTopology($topology);
                $edge->setSourceNode($sourceNode);
                $edge->setTargetNode($target);
                $edge->setProtocol($protocol);

                $edgeStyle = $style;
                $labels = [];
                if ($localPort !== '') {
                    $labels[] = ['text' => $localPort, 'position' => 'source', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
                }
                if ($remotePort !== '') {
                    $labels[] = ['text' => $remotePort, 'position' => 'target', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 400];
                }
                if (!empty($labels)) $edgeStyle['labels'] = $labels;
                if ($metric !== null) $edgeStyle['metric'] = $metric;
                $edge->setStyle($edgeStyle);

                $em->persist($edge);
                $stats['created']++;
            }
        }
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

    private function resolveTargetNode(
        string $destValue,
        string $nodeMatchField,
        array &$nodeByKey,
        array &$nodeById,
    ): ?Node {
        $lower = strtolower($destValue);

        if ($nodeMatchField === 'auto') {
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

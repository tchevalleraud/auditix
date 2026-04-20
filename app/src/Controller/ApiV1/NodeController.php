<?php

namespace App\Controller\ApiV1;

use App\Entity\Collection;
use App\Entity\CompliancePolicy;
use App\Entity\ComplianceResult;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\Node;
use App\Entity\NodeTag;
use App\Entity\Profile;
use App\Message\EvaluateComplianceMessage;
use App\Message\PingNodeMessage;
use App\Message\RecalculateNodeScoreMessage;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/nodes')]
#[OA\Tag(name: 'Nodes')]
class NodeController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function serialize(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        $profile = $n->getProfile();

        return [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'hostname' => $n->getHostname(),
            'score' => $n->getScore(),
            'complianceScore' => $n->getComplianceScore(),
            'vulnerabilityScore' => $n->getVulnerabilityScore(),
            'systemUpdateScore' => $n->getSystemUpdateScore(),
            'policy' => $n->getPolicy(),
            'discoveredModel' => $n->getDiscoveredModel(),
            'discoveredVersion' => $n->getDiscoveredVersion(),
            'productModel' => $n->getProductModel(),
            'complianceEvaluating' => $n->getComplianceEvaluating(),
            'isReachable' => $n->getIsReachable(),
            'lastPingAt' => $n->getLastPingAt()?->format('c'),
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

    private function findNodeOrFail(int $id, EntityManagerInterface $em, Request $request): ?Node
    {
        $node = $em->getRepository(Node::class)->find($id);
        if (!$node || $node->getContext()?->getId() !== $this->getContext($request)->getId()) {
            return null;
        }
        return $node;
    }

    private function findNodeByIpOrFail(string $ip, EntityManagerInterface $em, Request $request): ?Node
    {
        $node = $em->getRepository(Node::class)->findOneBy([
            'ipAddress' => $ip,
            'context' => $this->getContext($request),
        ]);
        return $node;
    }

    #[Route('', methods: ['GET'])]
    #[OA\Get(
        summary: 'List all nodes in the token context',
        parameters: [
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'tag', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'page', in: 'query', required: false, schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'limit', in: 'query', required: false, schema: new OA\Schema(type: 'integer', default: 50)),
        ],
        responses: [new OA\Response(response: 200, description: 'List of nodes')],
    )]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $page = max(1, $request->query->getInt('page', 1));
        $limit = min(200, max(1, $request->query->getInt('limit', 50)));
        $search = $request->query->get('search', '');
        $tagFilter = $request->query->get('tag', '');

        $qb = $em->createQueryBuilder()
            ->select('n')
            ->from(Node::class, 'n')
            ->where('n.context = :context')
            ->setParameter('context', $context)
            ->orderBy('n.ipAddress', 'ASC');

        if ($search !== '') {
            $qb->andWhere('n.ipAddress LIKE :search OR n.name LIKE :search OR n.hostname LIKE :search')
                ->setParameter('search', '%' . $search . '%');
        }

        if ($tagFilter !== '') {
            $qb->join('n.tags', 'tag')
                ->andWhere('tag.name = :tagName')
                ->setParameter('tagName', $tagFilter);
        }

        $countQb = (clone $qb)->select('COUNT(DISTINCT n.id)')->resetDQLPart('orderBy');
        $total = $countQb->getQuery()->getSingleScalarResult();
        $nodes = $qb->setFirstResult(($page - 1) * $limit)
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return $this->json([
            'data' => array_map($this->serialize(...), $nodes),
            'meta' => [
                'total' => (int) $total,
                'page' => $page,
                'limit' => $limit,
                'pages' => (int) ceil($total / $limit),
            ],
        ]);
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get a single node by ID',
        responses: [
            new OA\Response(response: 200, description: 'Node details'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function show(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($node));
    }

    #[Route('', methods: ['POST'])]
    #[OA\Post(
        summary: 'Create a new node',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['ipAddress'],
                properties: [
                    new OA\Property(property: 'ipAddress', type: 'string'),
                    new OA\Property(property: 'name', type: 'string', nullable: true),
                    new OA\Property(property: 'policy', type: 'string', enum: ['audit', 'enforce'], default: 'audit'),
                    new OA\Property(property: 'manufacturerId', type: 'integer', nullable: true),
                    new OA\Property(property: 'modelId', type: 'integer', nullable: true),
                    new OA\Property(property: 'profileId', type: 'integer', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'Node created'),
            new OA\Response(response: 400, description: 'Validation error'),
        ],
    )]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

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

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[OA\Put(
        summary: 'Update an existing node',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'ipAddress', type: 'string'),
                    new OA\Property(property: 'name', type: 'string', nullable: true),
                    new OA\Property(property: 'policy', type: 'string', enum: ['audit', 'enforce']),
                    new OA\Property(property: 'manufacturerId', type: 'integer', nullable: true),
                    new OA\Property(property: 'modelId', type: 'integer', nullable: true),
                    new OA\Property(property: 'profileId', type: 'integer', nullable: true),
                    new OA\Property(property: 'tagIds', type: 'array', items: new OA\Items(type: 'integer')),
                    new OA\Property(property: 'tagMode', type: 'string', enum: ['replace', 'merge'], default: 'replace'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Node updated'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->applyNodeUpdate($node, $request, $em);
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[OA\Delete(
        summary: 'Delete a node',
        responses: [
            new OA\Response(response: 204, description: 'Node deleted'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->applyNodeDelete($node, $em);
    }

    #[Route('/{id}/tags', methods: ['POST'], requirements: ['id' => '\d+'])]
    #[OA\Post(
        summary: 'Add a tag to a node',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['tagId'],
                properties: [new OA\Property(property: 'tagId', type: 'integer')],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Tag added'),
            new OA\Response(response: 404, description: 'Node or tag not found'),
        ],
    )]
    public function addTag(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $tagId = $data['tagId'] ?? null;
        if (!$tagId) {
            return $this->json(['error' => 'tagId is required'], Response::HTTP_BAD_REQUEST);
        }

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if (!$tag) {
            return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);
        }

        $node->addTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/tags/{tagId}', methods: ['DELETE'], requirements: ['id' => '\d+', 'tagId' => '\d+'])]
    #[OA\Delete(
        summary: 'Remove a tag from a node',
        responses: [
            new OA\Response(response: 200, description: 'Tag removed'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function removeTag(int $id, int $tagId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if ($tag) {
            $node->removeTag($tag);
        }
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/compliance', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get compliance results for a node',
        responses: [
            new OA\Response(response: 200, description: 'Compliance results grouped by policy'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function compliance(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeOrFail($id, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->buildComplianceResponse($node, $em);
    }

    // ── IP-based endpoints ──

    #[Route('/ip/{ip}', methods: ['GET'], requirements: ['ip' => '[^/]+'])]
    #[OA\Get(
        summary: 'Get a single node by IP address',
        responses: [
            new OA\Response(response: 200, description: 'Node details'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function showByIp(string $ip, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($node));
    }

    #[Route('/ip/{ip}', methods: ['PUT'], requirements: ['ip' => '[^/]+'])]
    #[OA\Put(
        summary: 'Update a node by IP address',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'ipAddress', type: 'string'),
                    new OA\Property(property: 'name', type: 'string', nullable: true),
                    new OA\Property(property: 'policy', type: 'string', enum: ['audit', 'enforce']),
                    new OA\Property(property: 'manufacturerId', type: 'integer', nullable: true),
                    new OA\Property(property: 'modelId', type: 'integer', nullable: true),
                    new OA\Property(property: 'profileId', type: 'integer', nullable: true),
                    new OA\Property(property: 'tagIds', type: 'array', items: new OA\Items(type: 'integer')),
                    new OA\Property(property: 'tagMode', type: 'string', enum: ['replace', 'merge'], default: 'replace'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Node updated'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function updateByIp(string $ip, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->applyNodeUpdate($node, $request, $em);
    }

    #[Route('/ip/{ip}', methods: ['DELETE'], requirements: ['ip' => '[^/]+'])]
    #[OA\Delete(
        summary: 'Delete a node by IP address',
        responses: [
            new OA\Response(response: 204, description: 'Node deleted'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function deleteByIp(string $ip, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->applyNodeDelete($node, $em);
    }

    #[Route('/ip/{ip}/tags', methods: ['POST'], requirements: ['ip' => '[^/]+'])]
    #[OA\Post(
        summary: 'Add a tag to a node (by IP)',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['tagId'],
                properties: [new OA\Property(property: 'tagId', type: 'integer')],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Tag added'),
            new OA\Response(response: 404, description: 'Node or tag not found'),
        ],
    )]
    public function addTagByIp(string $ip, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $tagId = $data['tagId'] ?? null;
        if (!$tagId) {
            return $this->json(['error' => 'tagId is required'], Response::HTTP_BAD_REQUEST);
        }

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if (!$tag) {
            return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);
        }

        $node->addTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/ip/{ip}/tags/{tagId}', methods: ['DELETE'], requirements: ['ip' => '[^/]+', 'tagId' => '\d+'])]
    #[OA\Delete(
        summary: 'Remove a tag from a node (by IP)',
        responses: [
            new OA\Response(response: 200, description: 'Tag removed'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function removeTagByIp(string $ip, int $tagId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if ($tag) {
            $node->removeTag($tag);
        }
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/ip/{ip}/compliance', methods: ['GET'], requirements: ['ip' => '[^/]+'])]
    #[OA\Get(
        summary: 'Get compliance results for a node (by IP)',
        responses: [
            new OA\Response(response: 200, description: 'Compliance results grouped by policy'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function complianceByIp(string $ip, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $node = $this->findNodeByIpOrFail($ip, $em, $request);
        if (!$node) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->buildComplianceResponse($node, $em);
    }

    // ── Shared logic (used by both ID and IP endpoints) ──

    private function applyNodeUpdate(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('ipAddress', $data)) {
            $ipAddress = $data['ipAddress'] ?? '';
            if (empty($ipAddress)) {
                return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
            }
            $node->setIpAddress($ipAddress);
        }
        if (array_key_exists('name', $data)) {
            $node->setName($data['name']);
        }
        if (array_key_exists('policy', $data)) {
            $node->setPolicy($data['policy']);
        }
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
            $tagMode = $data['tagMode'] ?? 'replace';
            if ($tagMode === 'replace') {
                foreach ($node->getTags()->toArray() as $tag) {
                    $node->removeTag($tag);
                }
            }
            foreach (($data['tagIds'] ?? []) as $tagId) {
                $tag = $em->getRepository(NodeTag::class)->find($tagId);
                if ($tag) {
                    $node->addTag($tag);
                }
            }
        }

        $em->flush();

        return $this->json($this->serialize($node));
    }

    private function applyNodeDelete(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $collections = $em->getRepository(Collection::class)->findBy(['node' => $node]);
        foreach ($collections as $collection) {
            $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();
            $this->deleteDirectory($storageDir);
        }

        $em->remove($node);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function buildComplianceResponse(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $results = $em->getRepository(ComplianceResult::class)->findBy(['node' => $node]);

        $policyMap = [];
        foreach ($results as $r) {
            $p = $r->getPolicy();
            $pId = $p->getId();
            if (!isset($policyMap[$pId])) {
                $policyMap[$pId] = [
                    'policy' => ['id' => $p->getId(), 'name' => $p->getName()],
                    'results' => [],
                    'stats' => ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0],
                    'evaluatedAt' => null,
                ];
            }

            $status = $r->getStatus();
            if ($status === 'skipped') {
                continue;
            }

            $rule = $r->getRule();
            $policyMap[$pId]['results'][] = [
                'ruleId' => $rule->getId(),
                'ruleIdentifier' => $rule->getIdentifier(),
                'ruleName' => $rule->getName(),
                'status' => $status,
                'severity' => $r->getSeverity(),
                'message' => $r->getMessage(),
                'evaluatedAt' => $r->getEvaluatedAt()->format('c'),
            ];

            if (isset($policyMap[$pId]['stats'][$status])) {
                $policyMap[$pId]['stats'][$status]++;
            }

            $evalAt = $r->getEvaluatedAt()->format('c');
            if (!$policyMap[$pId]['evaluatedAt'] || $evalAt > $policyMap[$pId]['evaluatedAt']) {
                $policyMap[$pId]['evaluatedAt'] = $evalAt;
            }
        }

        foreach ($policyMap as &$entry) {
            usort($entry['results'], fn($a, $b) =>
                strnatcasecmp($a['ruleIdentifier'] ?? '', $b['ruleIdentifier'] ?? '') ?: strcmp($a['ruleName'], $b['ruleName'])
            );
        }
        unset($entry);

        return $this->json([
            'score' => $node->getComplianceScore(),
            'policies' => array_values($policyMap),
        ]);
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

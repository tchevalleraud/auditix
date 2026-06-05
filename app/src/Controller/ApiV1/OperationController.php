<?php

namespace App\Controller\ApiV1;

use App\Entity\Collection;
use App\Entity\CompliancePolicy;
use App\Entity\Context;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use App\Message\EvaluateComplianceMessage;
use App\Message\ProcessInventoryMessage;
use App\Message\RecalculateNodeScoreMessage;
use App\Service\CollectionImporter;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/operations')]
#[OA\Tag(name: 'Operations')]
class OperationController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
        private readonly CollectionImporter $importer,
    ) {}

    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function resolveNodes(array $data, Context $context, EntityManagerInterface $em): array
    {
        $nodeIds = $data['nodeIds'] ?? [];
        $nodeIps = $data['nodeIps'] ?? [];

        if (empty($nodeIds) && empty($nodeIps)) {
            return [];
        }

        $qb = $em->createQueryBuilder()
            ->select('n')
            ->from(Node::class, 'n')
            ->where('n.context = :context')
            ->setParameter('context', $context);

        $conditions = [];
        if (!empty($nodeIds)) {
            $conditions[] = 'n.id IN (:ids)';
            $qb->setParameter('ids', $nodeIds);
        }
        if (!empty($nodeIps)) {
            $conditions[] = 'n.ipAddress IN (:ips)';
            $qb->setParameter('ips', $nodeIps);
        }

        $qb->andWhere(implode(' OR ', $conditions));

        return $qb->getQuery()->getResult();
    }

    #[Route('/collect', methods: ['POST'])]
    #[OA\Post(
        summary: 'Trigger data collection on nodes',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'nodeIds', type: 'array', items: new OA\Items(type: 'integer'), description: 'Node IDs'),
                    new OA\Property(property: 'nodeIps', type: 'array', items: new OA\Items(type: 'string'), description: 'Node IP addresses (alternative to nodeIds)'),
                    new OA\Property(property: 'tags', type: 'array', items: new OA\Items(type: 'string'), default: ['latest']),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'Collection jobs dispatched'),
            new OA\Response(response: 400, description: 'No nodes specified'),
        ],
    )]
    public function collect(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];
        $rawTags = $data['tags'] ?? [];
        $tags = array_values(array_unique(array_filter(array_map('trim', array_merge(['latest'], $rawTags)))));

        $nodes = $this->resolveNodes($data, $context, $em);
        if (empty($nodes)) {
            return $this->json(['error' => 'No valid nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $collections = [];
        foreach ($nodes as $node) {
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
            $this->bus->dispatch(new CollectNodeMessage($collection->getId()));
        }

        return $this->json([
            'dispatched' => count($collections),
            'collections' => array_map(fn(Collection $c) => [
                'id' => $c->getId(),
                'nodeId' => $c->getNode()->getId(),
                'status' => $c->getStatus(),
                'tags' => $c->getTags(),
                'createdAt' => $c->getCreatedAt()->format('c'),
            ], $collections),
        ], Response::HTTP_CREATED);
    }

    #[Route('/extract', methods: ['POST'])]
    #[OA\Post(
        summary: 'Trigger inventory extraction from existing collections',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'nodeIds', type: 'array', items: new OA\Items(type: 'integer'), description: 'Node IDs'),
                    new OA\Property(property: 'nodeIps', type: 'array', items: new OA\Items(type: 'string'), description: 'Node IP addresses (alternative to nodeIds)'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Extraction jobs dispatched'),
            new OA\Response(response: 400, description: 'No nodes specified'),
        ],
    )]
    public function extract(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

        $nodes = $this->resolveNodes($data, $context, $em);
        if (empty($nodes)) {
            return $this->json(['error' => 'No valid nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $dispatched = 0;
        foreach ($nodes as $node) {
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

    #[Route('/compliance', methods: ['POST'])]
    #[OA\Post(
        summary: 'Trigger compliance evaluation on nodes',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'nodeIds', type: 'array', items: new OA\Items(type: 'integer'), description: 'Node IDs'),
                    new OA\Property(property: 'nodeIps', type: 'array', items: new OA\Items(type: 'string'), description: 'Node IP addresses (alternative to nodeIds)'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Compliance evaluation jobs dispatched'),
            new OA\Response(response: 400, description: 'No nodes specified'),
        ],
    )]
    public function compliance(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

        $nodes = $this->resolveNodes($data, $context, $em);
        if (empty($nodes)) {
            return $this->json(['error' => 'No valid nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $dispatched = 0;
        foreach ($nodes as $node) {
            $policies = $em->createQuery(
                'SELECT p FROM App\Entity\CompliancePolicy p JOIN p.nodes n WHERE n = :node AND p.enabled = true'
            )->setParameter('node', $node)->getResult();

            if (empty($policies)) {
                $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
                continue;
            }

            foreach ($policies as $policy) {
                $this->bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
                $dispatched++;
            }

            $node->setScore(null);
            $node->setComplianceEvaluating('pending');
        }

        $em->flush();

        return $this->json(['dispatched' => $dispatched]);
    }

    #[Route('/import', methods: ['POST'])]
    #[OA\Post(
        summary: 'Manually import raw command output as a completed collection for a single node',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'nodeId', type: 'integer', nullable: true, description: 'Node ID (alternative to nodeIp)'),
                    new OA\Property(property: 'nodeIp', type: 'string', nullable: true, description: 'Node IP address (alternative to nodeId)'),
                    new OA\Property(property: 'rawOutput', type: 'string', description: 'Raw CLI output containing the configured commands'),
                    new OA\Property(property: 'tags', type: 'array', items: new OA\Items(type: 'string'), default: ['latest']),
                    new OA\Property(
                        property: 'promptPattern',
                        type: 'string',
                        nullable: true,
                        description: 'Optional regex (without delimiters) whose first capture group isolates the typed command at the prompt',
                    ),
                ],
                required: ['rawOutput'],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'Collection imported and inventory extraction dispatched'),
            new OA\Response(response: 400, description: 'Validation error'),
            new OA\Response(response: 404, description: 'Node not found'),
        ],
    )]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

        $rawOutput = $data['rawOutput'] ?? '';
        if ($rawOutput === '') {
            return $this->json(['error' => 'rawOutput is required'], Response::HTTP_BAD_REQUEST);
        }

        $tags = $data['tags'] ?? ['latest'];
        $promptPattern = isset($data['promptPattern']) ? trim((string) $data['promptPattern']) : '';

        $node = null;
        if (!empty($data['nodeId'])) {
            $node = $em->getRepository(Node::class)->find((int) $data['nodeId']);
        } elseif (!empty($data['nodeIp'])) {
            $node = $em->getRepository(Node::class)->findOneBy([
                'ipAddress' => $data['nodeIp'],
                'context' => $context,
            ]);
        }

        if (!$node || $node->getContext()?->getId() !== $context->getId()) {
            return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$node->getModel()) {
            return $this->json(['error' => 'Node has no model configured'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $collection = $this->importer->importRawOutputForNode(
                $node,
                $rawOutput,
                is_array($tags) ? $tags : [],
                'manual-import',
                $promptPattern !== '' ? $promptPattern : null,
            );
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        $this->bus->dispatch(new ProcessInventoryMessage($collection->getId()));

        return $this->json([
            'id' => $collection->getId(),
            'nodeId' => $node->getId(),
            'status' => $collection->getStatus(),
            'tags' => $collection->getTags(),
            'commandCount' => $collection->getCommandCount(),
            'completedCount' => $collection->getCompletedCount(),
            'createdAt' => $collection->getCreatedAt()->format('c'),
        ], Response::HTTP_CREATED);
    }

    #[Route('/import-zip', methods: ['POST'])]
    #[OA\Post(
        summary: 'Import a .zip or .tar.gz archive of collected outputs (one <ip>_output.log per node)',
        parameters: [
            new OA\Parameter(name: 'dryRun', in: 'query', required: false, schema: new OA\Schema(type: 'boolean', default: false), description: 'Validate the archive without persisting collections'),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['file'],
                    properties: [
                        new OA\Property(property: 'file', type: 'string', format: 'binary', description: '.zip or .tar.gz archive containing <ip>_output.log files'),
                        new OA\Property(property: 'tags[]', type: 'array', items: new OA\Items(type: 'string'), description: 'Extra tags applied to imported collections'),
                        new OA\Property(property: 'promptPattern', type: 'string', description: 'Optional regex (no delimiters) whose first capture group isolates the typed command'),
                    ],
                ),
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Import summary'),
            new OA\Response(response: 400, description: 'Validation error'),
        ],
    )]
    public function importZip(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
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

}

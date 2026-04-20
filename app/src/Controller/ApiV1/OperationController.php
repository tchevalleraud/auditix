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

    private function releaseTag(EntityManagerInterface $em, string $tag, Node $node): void
    {
        $collections = $em->getRepository(Collection::class)->findBy(['node' => $node]);
        foreach ($collections as $collection) {
            $tags = $collection->getTags();
            if (in_array($tag, $tags, true)) {
                $collection->setTags(array_values(array_filter($tags, fn(string $t) => $t !== $tag)));
            }
        }
    }
}

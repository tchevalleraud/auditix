<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\ComplianceResult;
use App\Entity\Context;
use App\Entity\Lab;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use App\Message\EvaluateComplianceMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/public/lab')]
class PublicLabController extends AbstractController
{
    private function resolveContext(string $token, EntityManagerInterface $em): ?Context
    {
        $context = $em->getRepository(Context::class)->findOneBy(['publicToken' => $token]);
        if (!$context || !$context->isPublicEnabled()) {
            return null;
        }
        return $context;
    }

    /** Collect all unique nodes across all labs (via tasks). */
    private function getAllNodes(array $labs): array
    {
        $map = [];
        foreach ($labs as $lab) {
            foreach ($lab->getTasks() as $task) {
                foreach ($task->getPolicies() as $policy) {
                    foreach ($policy->getNodes() as $node) {
                        $map[$node->getId()] = $node;
                    }
                }
            }
        }
        return array_values($map);
    }

    /** Build per-node compliance status for a set of policies. */
    private function buildNodeStatus(array $policies, EntityManagerInterface $em): array
    {
        $nodeStatus = [];
        foreach ($policies as $policy) {
            $results = $em->getRepository(ComplianceResult::class)->findBy(['policy' => $policy]);
            foreach ($results as $result) {
                if (!$result->getRule()->isEnabled()) {
                    continue;
                }
                $status = $result->getStatus();
                if ($status === 'not_applicable' || $status === 'skipped') {
                    continue;
                }
                $nid = $result->getNode()->getId();
                if (!isset($nodeStatus[$nid])) {
                    $nodeStatus[$nid] = ['compliant' => 0, 'total' => 0];
                }
                $nodeStatus[$nid]['total']++;
                if ($status === 'compliant') {
                    $nodeStatus[$nid]['compliant']++;
                }
            }
        }
        return $nodeStatus;
    }

    #[Route('/{token}', methods: ['GET'])]
    public function status(string $token, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($token, $em);
        if (!$context) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $labs = $em->getRepository(Lab::class)->findBy(['context' => $context], ['name' => 'ASC']);
        $allNodes = $this->getAllNodes($labs);

        // Check global status
        $collectingCount = 0;
        $evaluatingCount = 0;
        foreach ($allNodes as $node) {
            $pending = $em->getRepository(Collection::class)->findBy([
                'node' => $node,
                'status' => [Collection::STATUS_PENDING, Collection::STATUS_RUNNING],
            ]);
            if (count($pending) > 0) $collectingCount++;
            if ($node->getComplianceEvaluating() !== null) $evaluatingCount++;
        }

        // Build unique nodes list (columns)
        $nodesData = [];
        foreach ($allNodes as $node) {
            $nodesData[] = [
                'id' => $node->getId(),
                'name' => $node->getName(),
                'ipAddress' => $node->getIpAddress(),
                'hostname' => $node->getHostname(),
            ];
        }

        // Build labs data with tasks
        $labsData = [];
        foreach ($labs as $lab) {
            $tasksData = [];
            // Aggregate lab-level node results across all tasks
            $labNodeAgg = []; // nodeId => ['tasksPassed' => int, 'tasksTotal' => int, 'compliant' => int, 'total' => int]

            foreach ($lab->getTasks() as $task) {
                $taskPolicies = $task->getPolicies()->toArray();

                // Collect node IDs for this task
                $taskNodeIds = [];
                foreach ($taskPolicies as $policy) {
                    foreach ($policy->getNodes() as $node) {
                        $taskNodeIds[$node->getId()] = true;
                    }
                }

                // Build per-node compliance for this task
                $nodeStatus = $this->buildNodeStatus($taskPolicies, $em);

                $taskNodesResults = [];
                foreach ($allNodes as $node) {
                    $nid = $node->getId();
                    if (!isset($taskNodeIds[$nid])) {
                        $taskNodesResults[$nid] = null;
                    } else {
                        $s = $nodeStatus[$nid] ?? ['compliant' => 0, 'total' => 0];
                        $passed = $s['total'] > 0 && $s['compliant'] === $s['total'];
                        $taskNodesResults[$nid] = [
                            'compliant' => $s['compliant'],
                            'total' => $s['total'],
                            'passed' => $passed,
                        ];

                        // Aggregate for lab level
                        if (!isset($labNodeAgg[$nid])) {
                            $labNodeAgg[$nid] = ['tasksPassed' => 0, 'tasksTotal' => 0, 'compliant' => 0, 'total' => 0];
                        }
                        $labNodeAgg[$nid]['tasksTotal']++;
                        if ($passed) $labNodeAgg[$nid]['tasksPassed']++;
                        $labNodeAgg[$nid]['compliant'] += $s['compliant'];
                        $labNodeAgg[$nid]['total'] += $s['total'];
                    }
                }

                $tasksData[] = [
                    'id' => $task->getId(),
                    'name' => $task->getName(),
                    'description' => $task->getDescription(),
                    'nodes' => $taskNodesResults,
                ];
            }

            // Build lab-level aggregate per node
            $labNodesResults = [];
            foreach ($allNodes as $node) {
                $nid = $node->getId();
                if (!isset($labNodeAgg[$nid])) {
                    $labNodesResults[$nid] = null;
                } else {
                    $agg = $labNodeAgg[$nid];
                    $labNodesResults[$nid] = [
                        'compliant' => $agg['compliant'],
                        'total' => $agg['total'],
                        'passed' => $agg['tasksTotal'] > 0 && $agg['tasksPassed'] === $agg['tasksTotal'],
                    ];
                }
            }

            $labsData[] = [
                'id' => $lab->getId(),
                'name' => $lab->getName(),
                'description' => $lab->getDescription(),
                'tasks' => $tasksData,
                'nodes' => $labNodesResults,
            ];
        }

        return $this->json([
            'context' => [
                'name' => $context->getName(),
                'description' => $context->getDescription(),
            ],
            'nodes' => $nodesData,
            'labs' => $labsData,
            'isCollecting' => $collectingCount > 0,
            'isEvaluating' => $evaluatingCount > 0,
        ]);
    }

    #[Route('/{token}/validate', methods: ['POST'])]
    public function validate(string $token, EntityManagerInterface $em, MessageBusInterface $bus): JsonResponse
    {
        $context = $this->resolveContext($token, $em);
        if (!$context) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $labs = $em->getRepository(Lab::class)->findBy(['context' => $context]);
        $allNodes = $this->getAllNodes($labs);

        if (empty($allNodes)) {
            return $this->json(['error' => 'No nodes configured'], Response::HTTP_BAD_REQUEST);
        }

        // Check if already running
        foreach ($allNodes as $node) {
            $pending = $em->getRepository(Collection::class)->findBy([
                'node' => $node,
                'status' => [Collection::STATUS_PENDING, Collection::STATUS_RUNNING],
            ]);
            if (count($pending) > 0) {
                return $this->json(['error' => 'Already in progress'], Response::HTTP_CONFLICT);
            }
            if ($node->getComplianceEvaluating() !== null) {
                return $this->json(['error' => 'Already in progress'], Response::HTTP_CONFLICT);
            }
        }

        // Release tags and create collections
        foreach ($allNodes as $node) {
            $existing = $em->getRepository(Collection::class)->findBy(['node' => $node]);
            foreach ($existing as $c) {
                if (in_array('latest', $c->getTags(), true)) {
                    $c->removeTag('latest');
                }
            }

            $collection = new Collection();
            $collection->setNode($node);
            $collection->setContext($context);
            $collection->setTags(['latest']);
            $em->persist($collection);
        }

        $em->flush();

        $dispatched = 0;
        foreach ($allNodes as $node) {
            $latest = $em->getRepository(Collection::class)->findBy(
                ['node' => $node, 'status' => Collection::STATUS_PENDING],
                ['createdAt' => 'DESC'],
                1
            );
            if (!empty($latest)) {
                $bus->dispatch(new CollectNodeMessage($latest[0]->getId()));
                $dispatched++;
            }
        }

        return $this->json(['dispatched' => $dispatched, 'phase' => 'collection']);
    }

    #[Route('/{token}/check', methods: ['POST'])]
    public function check(string $token, EntityManagerInterface $em, MessageBusInterface $bus): JsonResponse
    {
        $context = $this->resolveContext($token, $em);
        if (!$context) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }

        $labs = $em->getRepository(Lab::class)->findBy(['context' => $context]);
        $allNodes = $this->getAllNodes($labs);

        // Check collections
        $collectingNodes = 0;
        foreach ($allNodes as $node) {
            $pending = $em->getRepository(Collection::class)->findBy([
                'node' => $node,
                'status' => [Collection::STATUS_PENDING, Collection::STATUS_RUNNING],
            ]);
            if (count($pending) > 0) $collectingNodes++;
        }

        if ($collectingNodes > 0) {
            return $this->json(['phase' => 'collection', 'remaining' => $collectingNodes]);
        }

        // Check evaluations
        $evaluatingNodes = 0;
        foreach ($allNodes as $node) {
            if ($node->getComplianceEvaluating() !== null) $evaluatingNodes++;
        }

        if ($evaluatingNodes > 0) {
            return $this->json(['phase' => 'compliance', 'remaining' => $evaluatingNodes]);
        }

        // Check if we need to trigger evaluation
        // Find the most recent collection completion time
        $latestCompletedAt = null;
        foreach ($allNodes as $node) {
            $latestCollection = $em->getRepository(Collection::class)->findBy(
                ['node' => $node, 'status' => Collection::STATUS_COMPLETED],
                ['completedAt' => 'DESC'],
                1
            );
            if (!empty($latestCollection)) {
                $completedAt = $latestCollection[0]->getCompletedAt();
                if ($completedAt && $completedAt->getTimestamp() > time() - 120) {
                    if (!$latestCompletedAt || $completedAt > $latestCompletedAt) {
                        $latestCompletedAt = $completedAt;
                    }
                }
            }
        }

        // Only trigger evaluation if there's a recent collection AND compliance
        // hasn't already been evaluated since that collection
        $needsEvaluation = false;
        if ($latestCompletedAt) {
            $needsEvaluation = true;
            // Check if compliance results already exist after the collection completed
            foreach ($labs as $lab) {
                foreach ($lab->getTasks() as $task) {
                    foreach ($task->getPolicies() as $policy) {
                        $results = $em->getRepository(ComplianceResult::class)->findBy(['policy' => $policy]);
                        foreach ($results as $result) {
                            if ($result->getEvaluatedAt() >= $latestCompletedAt) {
                                // Compliance was already evaluated after the latest collection
                                $needsEvaluation = false;
                                break 4;
                            }
                        }
                    }
                }
            }
        }

        if ($needsEvaluation) {
            $dispatched = 0;
            $processedPairs = [];
            foreach ($labs as $lab) {
                foreach ($lab->getTasks() as $task) {
                    foreach ($task->getPolicies() as $policy) {
                        foreach ($policy->getNodes() as $node) {
                            $key = $policy->getId() . '-' . $node->getId();
                            if (isset($processedPairs[$key])) continue;
                            $processedPairs[$key] = true;
                            $node->setScore(null);
                            $node->setComplianceEvaluating('pending');
                            $bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
                            $dispatched++;
                        }
                    }
                }
            }
            $em->flush();
            return $this->json(['phase' => 'compliance', 'remaining' => $dispatched, 'justStarted' => true]);
        }

        return $this->json(['phase' => 'done', 'remaining' => 0]);
    }
}

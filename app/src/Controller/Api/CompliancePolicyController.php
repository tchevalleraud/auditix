<?php

namespace App\Controller\Api;

use App\Entity\CompliancePolicy;
use App\Entity\ComplianceResult;
use App\Entity\ComplianceRule;
use App\Entity\ComplianceRuleFolder;
use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeTag;
use App\Message\EvaluateComplianceMessage;
use App\Service\ComplianceEvaluator;
use App\Service\NodeMatchEvaluator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/compliance-policies')]
class CompliancePolicyController extends AbstractController
{
    private function serialize(CompliancePolicy $p): array
    {
        return [
            'id' => $p->getId(),
            'name' => $p->getName(),
            'description' => $p->getDescription(),
            'enabled' => $p->isEnabled(),
            'matchRules' => $p->getMatchRules(),
            'createdAt' => $p->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->get('context');
        if (!$contextId) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $policies = $em->getRepository(CompliancePolicy::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $policies));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->get('context');

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $policy = new CompliancePolicy();
        $policy->setName($data['name']);
        $policy->setContext($context);

        if (array_key_exists('description', $data)) {
            $policy->setDescription($data['description']);
        }

        if (array_key_exists('enabled', $data)) {
            $policy->setEnabled((bool) $data['enabled']);
        }

        $em->persist($policy);
        $em->flush();

        return $this->json($this->serialize($policy), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(CompliancePolicy $policy): JsonResponse
    {
        return $this->json($this->serialize($policy));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $policy->setName($data['name']);
        }

        if (array_key_exists('description', $data)) {
            $policy->setDescription($data['description']);
        }

        if (array_key_exists('enabled', $data)) {
            $policy->setEnabled((bool) $data['enabled']);
        }

        $em->flush();

        return $this->json($this->serialize($policy));
    }

    #[Route('/{id}/rules', methods: ['GET'])]
    public function rules(CompliancePolicy $policy, EntityManagerInterface $em): JsonResponse
    {
        $rootFolder = $em->getRepository(ComplianceRuleFolder::class)->findOneBy([
            'policy' => $policy,
            'parent' => null,
        ]);

        $tree = $rootFolder ? $this->serializeFolderTree($rootFolder, $em) : null;

        // Extra rules (not in the policy folder)
        $extraRules = [];
        foreach ($policy->getExtraRules() as $r) {
            $data = $this->serializeRuleCompact($r);
            $data['folderPath'] = $this->buildFolderPath($r);
            $extraRules[] = $data;
        }
        usort($extraRules, fn($a, $b) => ($a['identifier'] ?? '') <=> ($b['identifier'] ?? '') ?: $a['name'] <=> $b['name']);

        return $this->json([
            'folder' => $tree,
            'extraRules' => $extraRules,
        ]);
    }

    #[Route('/{id}/rules/add', methods: ['POST'])]
    public function addExtraRule(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ruleId = $data['ruleId'] ?? null;
        if (!$ruleId) return $this->json(['error' => 'ruleId is required'], Response::HTTP_BAD_REQUEST);

        $rule = $em->getRepository(ComplianceRule::class)->find($ruleId);
        if (!$rule) return $this->json(['error' => 'Rule not found'], Response::HTTP_NOT_FOUND);

        $policy->addExtraRule($rule);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/{id}/rules/remove', methods: ['POST'])]
    public function removeExtraRule(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $ruleId = $data['ruleId'] ?? null;
        if (!$ruleId) return $this->json(['error' => 'ruleId is required'], Response::HTTP_BAD_REQUEST);

        $rule = $em->getRepository(ComplianceRule::class)->find($ruleId);
        if (!$rule) return $this->json(['error' => 'Rule not found'], Response::HTTP_NOT_FOUND);

        $policy->removeExtraRule($rule);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    private function serializeRuleCompact(ComplianceRule $r): array
    {
        return [
            'id' => $r->getId(),
            'identifier' => $r->getIdentifier(),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'enabled' => $r->isEnabled(),
        ];
    }

    private function serializeFolderTree(ComplianceRuleFolder $folder, EntityManagerInterface $em): array
    {
        $rules = $em->getRepository(ComplianceRule::class)->findBy(
            ['folder' => $folder],
            ['identifier' => 'ASC', 'name' => 'ASC']
        );

        $children = $em->getRepository(ComplianceRuleFolder::class)->findBy(
            ['parent' => $folder],
            ['name' => 'ASC']
        );

        return [
            'id' => $folder->getId(),
            'name' => $folder->getName(),
            'children' => array_map(fn($c) => $this->serializeFolderTree($c, $em), $children),
            'rules' => array_map(fn(ComplianceRule $r) => $this->serializeRuleCompact($r), $rules),
        ];
    }

    private function buildFolderPath(ComplianceRule $rule): array
    {
        $folder = $rule->getFolder();
        if (!$folder) {
            return [];
        }

        $parts = [];
        $current = $folder;
        while ($current !== null) {
            $parts[] = $current->getName();
            $current = $current->getParent();
        }

        return array_reverse($parts);
    }

    #[Route('/{id}/nodes', methods: ['GET'])]
    public function nodes(CompliancePolicy $policy): JsonResponse
    {
        $nodes = [];
        foreach ($policy->getNodes() as $n) {
            $nodes[] = $this->serializeNodeCompact($n);
        }
        usort($nodes, fn($a, $b) => ($a['name'] ?? '') <=> ($b['name'] ?? '') ?: $a['ipAddress'] <=> $b['ipAddress']);

        return $this->json($nodes);
    }

    #[Route('/{id}/nodes/add', methods: ['POST'])]
    public function addNodes(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];
        if (empty($nodeIds)) {
            return $this->json(['error' => 'nodeIds is required'], Response::HTTP_BAD_REQUEST);
        }

        $nodeRepo = $em->getRepository(Node::class);
        foreach ($nodeIds as $nodeId) {
            $node = $nodeRepo->find($nodeId);
            if ($node) {
                $policy->addNode($node);
            }
        }
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/{id}/nodes/remove', methods: ['POST'])]
    public function removeNodes(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];
        if (empty($nodeIds)) {
            return $this->json(['error' => 'nodeIds is required'], Response::HTTP_BAD_REQUEST);
        }

        $nodeRepo = $em->getRepository(Node::class);
        foreach ($nodeIds as $nodeId) {
            $node = $nodeRepo->find($nodeId);
            if ($node) {
                $policy->removeNode($node);
            }
        }
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/{id}/nodes/add-by-tags', methods: ['POST'])]
    public function addNodesByTags(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $tagIds = $data['tagIds'] ?? [];
        if (empty($tagIds)) {
            return $this->json(['error' => 'tagIds is required'], Response::HTTP_BAD_REQUEST);
        }

        // Find nodes that have ALL the specified tags
        $qb = $em->createQueryBuilder();
        $qb->select('n')
            ->from(Node::class, 'n')
            ->where('n.context = :context')
            ->setParameter('context', $policy->getContext());

        foreach ($tagIds as $i => $tagId) {
            $tag = $em->getRepository(NodeTag::class)->find($tagId);
            if (!$tag) continue;
            $qb->andWhere(":tag{$i} MEMBER OF n.tags")
                ->setParameter("tag{$i}", $tag);
        }

        $nodes = $qb->getQuery()->getResult();
        $added = 0;
        foreach ($nodes as $node) {
            if (!$policy->getNodes()->contains($node)) {
                $policy->addNode($node);
                $added++;
            }
        }
        $em->flush();

        return $this->json(['ok' => true, 'added' => $added, 'matched' => count($nodes)]);
    }

    private function serializeNodeCompact(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        return [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'hostname' => $n->getHostname(),
            'manufacturer' => $manufacturer ? ['id' => $manufacturer->getId(), 'name' => $manufacturer->getName()] : null,
            'model' => $model ? ['id' => $model->getId(), 'name' => $model->getName()] : null,
            'tags' => $n->getTags()->map(fn(NodeTag $t) => [
                'id' => $t->getId(),
                'name' => $t->getName(),
                'color' => $t->getColor(),
            ])->toArray(),
        ];
    }

    #[Route('/{id}/match-rules', methods: ['PUT'])]
    public function updateMatchRules(CompliancePolicy $policy, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $policy->setMatchRules($data['matchRules'] ?? null);
        $em->flush();

        return $this->json(['ok' => true, 'matchRules' => $policy->getMatchRules()]);
    }

    #[Route('/{id}/match-rules/preview', methods: ['POST'])]
    public function previewMatchRules(CompliancePolicy $policy, Request $request, NodeMatchEvaluator $evaluator): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $matchRules = $data['matchRules'] ?? null;
        if (!$matchRules || empty($matchRules['blocks'])) {
            return $this->json([]);
        }

        $matchingNodes = $evaluator->getMatchingNodes($policy->getContext(), $matchRules);
        return $this->json(array_map($this->serializeNodeCompact(...), $matchingNodes));
    }

    #[Route('/{id}/match-rules/apply', methods: ['POST'])]
    public function applyMatchRules(CompliancePolicy $policy, EntityManagerInterface $em, NodeMatchEvaluator $evaluator): JsonResponse
    {
        $matchRules = $policy->getMatchRules();
        if (!$matchRules || empty($matchRules['blocks'])) {
            return $this->json(['added' => 0, 'matched' => 0, 'total' => $policy->getNodes()->count()]);
        }

        $matchingNodes = $evaluator->getMatchingNodes($policy->getContext(), $matchRules);
        $added = 0;
        foreach ($matchingNodes as $node) {
            if (!$policy->getNodes()->contains($node)) {
                $policy->addNode($node);
                $added++;
            }
        }
        $em->flush();

        return $this->json(['added' => $added, 'matched' => count($matchingNodes), 'total' => $policy->getNodes()->count()]);
    }

    #[Route('/{id}/evaluate', methods: ['POST'])]
    public function evaluate(CompliancePolicy $policy, MessageBusInterface $bus, EntityManagerInterface $em, NodeMatchEvaluator $evaluator): JsonResponse
    {
        // Auto-apply match rules before evaluating
        $matchRules = $policy->getMatchRules();
        if ($matchRules && !empty($matchRules['blocks'])) {
            $matchingNodes = $evaluator->getMatchingNodes($policy->getContext(), $matchRules);
            foreach ($matchingNodes as $node) {
                $policy->addNode($node);
            }
        }

        $nodes = $policy->getNodes();
        $nodeIds = [];
        foreach ($nodes as $node) {
            $bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
            $node->setScore(null);
            $node->setComplianceEvaluating('pending');
            $nodeIds[] = $node->getId();
        }
        $em->flush();

        return $this->json(['dispatched' => count($nodeIds), 'nodeIds' => $nodeIds]);
    }

    #[Route('/{id}/results', methods: ['GET'])]
    public function results(CompliancePolicy $policy, EntityManagerInterface $em): JsonResponse
    {
        $results = $em->getRepository(ComplianceResult::class)->findBy(
            ['policy' => $policy],
            ['node' => 'ASC']
        );

        // Group by node
        $nodeMap = [];
        foreach ($results as $r) {
            $nodeId = $r->getNode()->getId();
            if (!isset($nodeMap[$nodeId])) {
                $n = $r->getNode();
                $tags = [];
                foreach ($n->getTags() as $tag) {
                    $tags[] = ['id' => $tag->getId(), 'name' => $tag->getName(), 'color' => $tag->getColor()];
                }
                $nodeMap[$nodeId] = [
                    'node' => [
                        'id' => $n->getId(),
                        'name' => $n->getName(),
                        'ipAddress' => $n->getIpAddress(),
                        'hostname' => $n->getHostname(),
                        'score' => $n->getScore(),
                        'complianceEvaluating' => $n->getComplianceEvaluating(),
                        'tags' => $tags,
                    ],
                    'results' => [],
                    'stats' => ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0, 'skipped' => 0],
                    'evaluatedAt' => null,
                ];
            }

            $status = $r->getStatus();

            // Count skipped but don't include in results list
            if ($status === 'skipped') {
                $nodeMap[$nodeId]['stats']['skipped']++;
                continue;
            }

            $rule = $r->getRule();
            $nodeMap[$nodeId]['results'][] = [
                'ruleId' => $rule->getId(),
                'ruleIdentifier' => $rule->getIdentifier(),
                'ruleName' => $rule->getName(),
                'ruleDescription' => $rule->getDescription(),
                'status' => $r->getStatus(),
                'severity' => $r->getSeverity(),
                'message' => $r->getMessage(),
                'evaluatedAt' => $r->getEvaluatedAt()->format('c'),
            ];

            if (isset($nodeMap[$nodeId]['stats'][$status])) {
                $nodeMap[$nodeId]['stats'][$status]++;
            }

            $evalAt = $r->getEvaluatedAt()->format('c');
            if (!$nodeMap[$nodeId]['evaluatedAt'] || $evalAt > $nodeMap[$nodeId]['evaluatedAt']) {
                $nodeMap[$nodeId]['evaluatedAt'] = $evalAt;
            }
        }

        // Sort results by rule identifier (natural sort)
        foreach ($nodeMap as &$entry) {
            usort($entry['results'], function ($a, $b) {
                return strnatcasecmp($a['ruleIdentifier'] ?? '', $b['ruleIdentifier'] ?? '') ?: strcmp($a['ruleName'], $b['ruleName']);
            });
        }
        unset($entry);

        return $this->json(array_values($nodeMap));
    }

    #[Route('/{id}/results/{nodeId}', methods: ['DELETE'])]
    public function deleteNodeResults(CompliancePolicy $policy, int $nodeId, EntityManagerInterface $em): JsonResponse
    {
        $node = $em->getRepository(Node::class)->find($nodeId);
        if (!$node) return $this->json(['error' => 'Node not found'], Response::HTTP_NOT_FOUND);

        $em->createQuery(
            'DELETE FROM App\Entity\ComplianceResult r WHERE r.policy = :policy AND r.node = :node'
        )->setParameter('policy', $policy)->setParameter('node', $node)->execute();

        $node->setScore(null);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(CompliancePolicy $policy, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($policy);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

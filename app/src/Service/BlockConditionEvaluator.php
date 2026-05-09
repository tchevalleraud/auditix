<?php

namespace App\Service;

use App\Entity\ComplianceResult;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\Report;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Evaluates a "conditional" block's condition tree against the report context.
 *
 * Condition tree shape (mirrors the frontend ConditionGroup / ConditionLeaf):
 *   {
 *     id, kind: 'group', op: 'and'|'or', negate?: bool,
 *     items: [<group|leaf>, ...]
 *   }
 *
 * Leaf kinds:
 *   - node_compliance     { nodeId, status: string[] }
 *   - scope_compliance    { scope: 'all'|'tag'|'nodes', tagIds?, nodeIds?, status, matchMode }
 *   - rule_compliance     { policyId, ruleId, scope, tagIds?, nodeIds?, status, matchMode }
 *   - inventory_present   { scope, tagIds?, nodeIds?, categoryName, entryKey? }
 */
class BlockConditionEvaluator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function evaluate(?array $tree, ?Node $forNode, ?Report $report): bool
    {
        if (!is_array($tree) || empty($tree)) return false;
        return $this->evalNode($tree, $forNode, $report);
    }

    /**
     * Extract a primary scope from a condition tree to inherit to children.
     * Returns null when no scope can be derived. The first leaf with scope
     * info wins (depth-first); single-node leaves yield scope=nodes.
     *
     * @return array{scope: 'all'|'tag'|'nodes'|'device', nodeId?: int, nodeIds?: int[], tagIds?: int[]}|null
     */
    public function extractInheritedScope(?array $tree): ?array
    {
        if (!is_array($tree)) return null;
        $kind = $tree['kind'] ?? '';
        if ($kind === 'group') {
            foreach (($tree['items'] ?? []) as $child) {
                $s = $this->extractInheritedScope($child);
                if ($s !== null) return $s;
            }
            return null;
        }
        // leaf
        if ($kind === 'node_compliance') {
            $nid = $tree['nodeId'] ?? null;
            return $nid ? ['scope' => 'nodes', 'nodeIds' => [(int) $nid]] : null;
        }
        $scope = (string) ($tree['scope'] ?? 'all');
        if ($scope === 'tag') {
            $tagIds = array_map('intval', (array) ($tree['tagIds'] ?? []));
            return $tagIds ? ['scope' => 'tag', 'tagIds' => $tagIds] : null;
        }
        if ($scope === 'nodes') {
            $nodeIds = array_map('intval', (array) ($tree['nodeIds'] ?? []));
            return $nodeIds ? ['scope' => 'nodes', 'nodeIds' => $nodeIds] : null;
        }
        if ($scope === 'all') {
            return ['scope' => 'all'];
        }
        return null;
    }

    private function evalNode(array $node, ?Node $forNode, ?Report $report): bool
    {
        $kind = $node['kind'] ?? '';
        if ($kind === 'group') {
            $op = (string) ($node['op'] ?? 'and');
            $items = $node['items'] ?? [];
            $negate = !empty($node['negate']);
            if (empty($items)) return $negate ? true : false;
            $result = $op === 'and';
            foreach ($items as $child) {
                $v = $this->evalNode($child, $forNode, $report);
                if ($op === 'and') {
                    $result = $result && $v;
                    if (!$result) break;
                } else {
                    $result = $result || $v;
                    if ($result) break;
                }
            }
            return $negate ? !$result : $result;
        }
        return $this->evalLeaf($node, $forNode, $report);
    }

    private function evalLeaf(array $leaf, ?Node $forNode, ?Report $report): bool
    {
        $kind = (string) ($leaf['kind'] ?? '');
        return match ($kind) {
            'node_compliance'    => $this->evalNodeCompliance($leaf, $forNode),
            'scope_compliance'   => $this->evalScopeCompliance($leaf, $forNode, $report),
            'rule_compliance'    => $this->evalRuleCompliance($leaf, $forNode, $report),
            'inventory_present'  => $this->evalInventoryPresent($leaf, $forNode, $report),
            default => false,
        };
    }

    private function evalNodeCompliance(array $leaf, ?Node $forNode): bool
    {
        $nodeId = $leaf['nodeId'] ?? null;
        // For node-type reports, default to forNode when no nodeId is set
        $node = $nodeId ? $this->em->getRepository(Node::class)->find((int) $nodeId) : $forNode;
        if (!$node) return false;
        $statuses = $this->normalizeStatuses($leaf['status'] ?? []);
        if (empty($statuses)) return false;

        $qb = $this->em->createQueryBuilder()
            ->select('cr.status')
            ->from(ComplianceResult::class, 'cr')
            ->where('cr.node = :node')
            ->setParameter('node', $node);
        $rows = $qb->getQuery()->getScalarResult();
        foreach ($rows as $r) {
            if (in_array($r['status'], $statuses, true)) return true;
        }
        return false;
    }

    private function evalScopeCompliance(array $leaf, ?Node $forNode, ?Report $report): bool
    {
        $nodes = $this->resolveScope($leaf, $forNode, $report);
        if (empty($nodes)) return false;
        $statuses = $this->normalizeStatuses($leaf['status'] ?? []);
        if (empty($statuses)) return false;

        $matchMode = (string) ($leaf['matchMode'] ?? 'any');
        $matched = 0;
        foreach ($nodes as $n) {
            $hit = $this->nodeHasResultWithStatus($n, $statuses);
            if ($matchMode === 'any' && $hit) return true;
            if ($matchMode === 'all' && !$hit) return false;
            if ($matchMode === 'none' && $hit) return false;
            if ($hit) $matched++;
        }
        if ($matchMode === 'all') return $matched === count($nodes);
        if ($matchMode === 'none') return true;
        return false; // matchMode = any but nothing matched
    }

    private function evalRuleCompliance(array $leaf, ?Node $forNode, ?Report $report): bool
    {
        $ruleId = $leaf['ruleId'] ?? null;
        if (!$ruleId) return false;
        $nodes = $this->resolveScope($leaf, $forNode, $report);
        if (empty($nodes)) return false;
        $statuses = $this->normalizeStatuses($leaf['status'] ?? []);
        if (empty($statuses)) return false;

        $matchMode = (string) ($leaf['matchMode'] ?? 'any');
        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

        $qb = $this->em->createQueryBuilder()
            ->select('IDENTITY(cr.node) AS node_id', 'cr.status')
            ->from(ComplianceResult::class, 'cr')
            ->where('cr.rule = :ruleId')
            ->andWhere('cr.node IN (:ids)')
            ->setParameter('ruleId', (int) $ruleId)
            ->setParameter('ids', $nodeIds);
        $rows = $qb->getQuery()->getScalarResult();

        $matchedById = [];
        foreach ($rows as $r) {
            if (in_array($r['status'], $statuses, true)) {
                $matchedById[(int) $r['node_id']] = true;
            }
        }

        $matched = count($matchedById);
        if ($matchMode === 'any') return $matched > 0;
        if ($matchMode === 'all') return $matched === count($nodeIds);
        if ($matchMode === 'none') return $matched === 0;
        return false;
    }

    private function evalInventoryPresent(array $leaf, ?Node $forNode, ?Report $report): bool
    {
        $category = trim((string) ($leaf['categoryName'] ?? ''));
        if ($category === '') return false;
        $entryKey = trim((string) ($leaf['entryKey'] ?? ''));
        $nodes = $this->resolveScope($leaf, $forNode, $report);
        if (empty($nodes)) return false;
        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

        $qb = $this->em->createQueryBuilder()
            ->select('COUNT(e.id)')
            ->from(NodeInventoryEntry::class, 'e')
            ->where('e.node IN (:ids)')
            ->andWhere('e.categoryName = :cat')
            ->setParameter('ids', $nodeIds)
            ->setParameter('cat', $category);
        if ($entryKey !== '') {
            $qb->andWhere('e.entryKey = :ek')->setParameter('ek', $entryKey);
        }
        $count = (int) $qb->getQuery()->getSingleScalarResult();
        return $count > 0;
    }

    private function nodeHasResultWithStatus(Node $node, array $statuses): bool
    {
        $qb = $this->em->createQueryBuilder()
            ->select('1')
            ->from(ComplianceResult::class, 'cr')
            ->where('cr.node = :n')
            ->andWhere('cr.status IN (:st)')
            ->setMaxResults(1)
            ->setParameter('n', $node)
            ->setParameter('st', $statuses);
        return !empty($qb->getQuery()->getScalarResult());
    }

    /**
     * Resolve a leaf's scope into a list of Nodes.
     */
    private function resolveScope(array $leaf, ?Node $forNode, ?Report $report): array
    {
        // For node-type reports we always restrict to the current node.
        if ($forNode) return [$forNode];

        $context = $report?->getContext();
        if (!$context) return [];

        $scope = (string) ($leaf['scope'] ?? 'all');
        $repo = $this->em->getRepository(Node::class);

        if ($scope === 'nodes') {
            $ids = array_map('intval', (array) ($leaf['nodeIds'] ?? []));
            if (empty($ids)) return [];
            return $repo->findBy(['context' => $context, 'id' => $ids]);
        }
        if ($scope === 'tag') {
            $tagIds = array_map('intval', (array) ($leaf['tagIds'] ?? []));
            if (empty($tagIds)) return [];
            $candidates = $repo->findBy(['context' => $context]);
            $matched = [];
            foreach ($candidates as $n) {
                foreach ($n->getTags() as $tg) {
                    if (in_array((int) $tg->getId(), $tagIds, true)) {
                        $matched[$n->getId()] = $n;
                        break;
                    }
                }
            }
            return array_values($matched);
        }
        return $repo->findBy(['context' => $context]);
    }

    private function normalizeStatuses(mixed $s): array
    {
        if (!is_array($s)) return [];
        $allowed = ['compliant', 'non_compliant', 'error', 'not_applicable', 'skipped'];
        return array_values(array_intersect($allowed, array_map('strval', $s)));
    }
}

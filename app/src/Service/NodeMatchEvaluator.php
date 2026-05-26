<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeDynamicTag;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use Doctrine\ORM\EntityManagerInterface;

class NodeMatchEvaluator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ComplianceEvaluator $complianceEvaluator,
    ) {}

    /**
     * Get all nodes from a context that evaluate to "include".
     *
     * @return Node[]
     */
    public function getMatchingNodes(Context $context, array $matchRules): array
    {
        $blocks = $matchRules['blocks'] ?? [];
        if (empty($blocks)) {
            return [];
        }

        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
        $matching = [];

        foreach ($nodes as $node) {
            $result = $this->evaluateNode($node, $matchRules);
            if ($result === 'include') {
                $matching[] = $node;
            }
        }

        return $matching;
    }

    /**
     * Evaluate match rules against a single node.
     *
     * @return string|null "include", "exclude", or null (no block matched)
     */
    public function evaluateNode(Node $node, array $matchRules): ?string
    {
        $blocks = $matchRules['blocks'] ?? [];

        foreach ($blocks as $block) {
            $type = $block['type'] ?? 'if';

            if ($type === 'else') {
                return $block['result'] ?? 'exclude';
            }

            if ($this->evaluateBlockConditions($block, $node)) {
                return $block['result'] ?? 'include';
            }
        }

        return null;
    }

    private function evaluateBlockConditions(array $block, Node $node): bool
    {
        $conditions = $block['conditions'] ?? [];
        if (empty($conditions)) {
            return false;
        }

        $logic = $block['logic'] ?? 'and';

        foreach ($conditions as $condition) {
            $pass = $this->evaluateSingleCondition($condition, $node);

            if ($logic === 'and' && !$pass) {
                return false;
            }
            if ($logic === 'or' && $pass) {
                return true;
            }
        }

        return $logic === 'and';
    }

    private function evaluateSingleCondition(array $condition, Node $node): bool
    {
        $field = $condition['field'] ?? '';
        $operator = $condition['operator'] ?? '';
        $value = $condition['value'] ?? null;

        if ($field === 'tag') {
            return $this->evaluateTagCondition($node, $operator, $value);
        }

        if ($field === 'inventory') {
            $fieldValue = $this->getInventoryValue($node, $condition);
            return $this->complianceEvaluator->compareValue($fieldValue, $operator, $value);
        }

        $fieldValue = $this->getNodeFieldValue($node, $field);
        return $this->complianceEvaluator->compareValue($fieldValue, $operator, $value);
    }

    private function getNodeFieldValue(Node $node, string $field): ?string
    {
        return match ($field) {
            'name' => $node->getName(),
            'hostname' => $node->getHostname(),
            'ipAddress' => $node->getIpAddress(),
            'discoveredModel' => $node->getDiscoveredModel(),
            'discoveredVersion' => $node->getDiscoveredVersion(),
            'productModel' => $node->getProductModel(),
            'manufacturer' => $node->getManufacturer()?->getName(),
            'model' => $node->getModel()?->getName(),
            default => null,
        };
    }

    private function evaluateTagCondition(Node $node, string $operator, ?string $value): bool
    {
        $tags = $this->getAllNodeTags($node);

        if ($operator === 'exists' || $operator === 'is_not_empty') {
            return !empty($tags);
        }
        if ($operator === 'not_exists' || $operator === 'is_empty') {
            return empty($tags);
        }

        foreach ($tags as $tag) {
            if ($this->complianceEvaluator->compareValue($tag->getName(), $operator, $value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return both manual tags (Node ↔ NodeTag) and dynamic tags applied by
     * collection rules (NodeDynamicTag), deduplicated by tag id.
     *
     * @return NodeTag[]
     */
    private function getAllNodeTags(Node $node): array
    {
        $byId = [];
        foreach ($node->getTags() as $tag) {
            $byId[$tag->getId()] = $tag;
        }
        $dynamic = $this->em->getRepository(NodeDynamicTag::class)->findBy(['node' => $node]);
        foreach ($dynamic as $d) {
            $tag = $d->getTag();
            $byId[$tag->getId()] = $tag;
        }
        return array_values($byId);
    }

    private function getInventoryValue(Node $node, array $condition): ?string
    {
        $categoryId = $condition['inventoryCategoryId'] ?? null;
        $key = $condition['inventoryKey'] ?? null;
        $column = $condition['inventoryColumn'] ?? 'Value#1';

        if (!$categoryId || !$key) {
            return null;
        }

        $entry = $this->em->createQueryBuilder()
            ->select('e')
            ->from(NodeInventoryEntry::class, 'e')
            ->innerJoin('e.collectionTag', 't')
            ->where('e.node = :node')
            ->andWhere('e.category = :cat')
            ->andWhere('e.entryKey = :key')
            ->andWhere('e.colLabel = :col')
            ->andWhere('t.name = :tag')
            ->setParameter('node', $node)
            ->setParameter('cat', $categoryId)
            ->setParameter('key', $key)
            ->setParameter('col', $column)
            ->setParameter('tag', 'latest')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        return $entry?->getValue();
    }
}

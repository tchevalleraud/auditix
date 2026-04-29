<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Evaluates "auto-selection" rules attached to inventory_table report blocks.
 * Rule shape (matches frontend InventoryNodeRule):
 *   {
 *     type: tag|discoveredVersion|manufacturer|model|productModel|hostname|inventory,
 *     operator: eq|neq|contains|not_contains|starts_with|ends_with,
 *     value?: string, tagId?: int, category?: string, entryKey?: string, colLabel?: string
 *   }
 */
class InventoryNodeRuleEvaluator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * @param array<int, array<string, mixed>> $rules
     * @return int[] matching node IDs
     */
    public function matchNodeIds(Context $context, array $rules, string $match = 'any'): array
    {
        if (empty($rules)) return [];

        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
        $matching = [];
        foreach ($nodes as $node) {
            if ($this->matches($node, $rules, $match)) {
                $matching[] = $node->getId();
            }
        }
        return $matching;
    }

    public function matches(Node $node, array $rules, string $match = 'any'): bool
    {
        if (empty($rules)) return false;
        $all = $match === 'all';
        foreach ($rules as $rule) {
            $ok = $this->evaluateRule($node, $rule);
            if ($all && !$ok) return false;
            if (!$all && $ok) return true;
        }
        return $all;
    }

    private function evaluateRule(Node $node, array $rule): bool
    {
        $type = (string) ($rule['type'] ?? '');
        $op = (string) ($rule['operator'] ?? 'eq');

        if ($type === 'tag') {
            $tagId = isset($rule['tagId']) ? (int) $rule['tagId'] : null;
            if (!$tagId) return false;
            $hasTag = false;
            foreach ($node->getTags() as $t) {
                if ($t->getId() === $tagId) { $hasTag = true; break; }
            }
            return $op === 'neq' ? !$hasTag : $hasTag;
        }

        if ($type === 'manufacturer') {
            $val = $rule['value'] ?? null;
            if ($val === null || $val === '') return false;
            $manuId = (int) $val;
            $current = $node->getManufacturer()?->getId();
            $eq = $current !== null && $current === $manuId;
            return $op === 'neq' ? !$eq : $eq;
        }

        if ($type === 'model') {
            $val = $rule['value'] ?? null;
            if ($val === null || $val === '') return false;
            $modelId = (int) $val;
            $current = $node->getModel()?->getId();
            $eq = $current !== null && $current === $modelId;
            return $op === 'neq' ? !$eq : $eq;
        }

        if ($type === 'inventory') {
            $cat = (string) ($rule['category'] ?? '');
            $key = (string) ($rule['entryKey'] ?? '');
            $col = (string) ($rule['colLabel'] ?? '');
            $value = (string) ($rule['value'] ?? '');
            if ($cat === '' || $key === '' || $col === '') return false;
            $entry = $this->em->getRepository(NodeInventoryEntry::class)->findOneBy([
                'node' => $node,
                'categoryName' => $cat,
                'entryKey' => $key,
                'colLabel' => $col,
            ]);
            $cellVal = $entry?->getValue() ?? '';
            return $this->compareString($cellVal, $op, $value);
        }

        // Plain string fields
        $fieldVal = match ($type) {
            'discoveredVersion' => $node->getDiscoveredVersion() ?? '',
            'productModel' => $node->getProductModel() ?? '',
            'hostname' => $node->getHostname() ?? '',
            default => '',
        };
        $expected = (string) ($rule['value'] ?? '');
        return $this->compareString($fieldVal, $op, $expected);
    }

    private function compareString(string $cell, string $op, string $expected): bool
    {
        $c = mb_strtolower($cell);
        $e = mb_strtolower($expected);
        return match ($op) {
            'eq' => $c === $e,
            'neq' => $c !== $e,
            'contains' => $e !== '' && str_contains($c, $e),
            'not_contains' => $e === '' || !str_contains($c, $e),
            'starts_with' => $e !== '' && str_starts_with($c, $e),
            'ends_with' => $e !== '' && str_ends_with($c, $e),
            default => false,
        };
    }
}

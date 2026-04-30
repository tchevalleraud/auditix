<?php

namespace App\Service;

use App\Entity\InventoryCategory;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Evaluate IF/ELSEIF/ELSE condition trees over a flat field map.
 *
 * Shared between compliance rules (status output) and collection rules
 * (dynamic tag / inventory entry output). Generic over the result shape:
 * each block's `result` is returned as-is when the block matches.
 */
class ConditionTreeEvaluator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * Walk the blocks in order and return the result of the first block whose
     * conditions match (or the `else` block if reached). Recurses into
     * children when present.
     */
    public function evaluateBlocks(array $blocks, array $fields, ?Node $node = null): mixed
    {
        foreach ($blocks as $block) {
            if (($block['type'] ?? 'if') === 'else' || $this->evaluateConditions($block, $fields, $node)) {
                if (!empty($block['children'])) {
                    return $this->evaluateBlocks($block['children'], $fields, $node);
                }
                return $block['result'] ?? null;
            }
        }
        return null;
    }

    public function evaluateConditions(array $block, array $fields, ?Node $node = null): bool
    {
        $logic = $block['logic'] ?? 'and';
        $conditions = $block['conditions'] ?? [];
        if (empty($conditions)) return true;

        $evaluated = 0;

        foreach ($conditions as $cond) {
            if ($node !== null) {
                $condNodeId = $cond['nodeId'] ?? null;
                $condNodeTagId = $cond['nodeTagId'] ?? null;
                $condMfrId = $cond['nodeManufacturerId'] ?? null;
                $condModelId = $cond['nodeModelId'] ?? null;

                if ($condNodeId !== null && (int) $condNodeId !== $node->getId()) {
                    continue;
                }
                if ($condNodeTagId !== null) {
                    $hasTag = false;
                    foreach ($node->getTags() as $tag) {
                        if ($tag->getId() === (int) $condNodeTagId) { $hasTag = true; break; }
                    }
                    if (!$hasTag) continue;
                }
                if ($condMfrId !== null) {
                    if (!$node->getManufacturer() || $node->getManufacturer()->getId() !== (int) $condMfrId) continue;
                }
                if ($condModelId !== null) {
                    if (!$node->getModel() || $node->getModel()->getId() !== (int) $condModelId) continue;
                }
            }

            $evaluated++;
            $result = $this->evaluateSingleCondition($cond, $fields, $node);
            if ($logic === 'or' && $result) return true;
            if ($logic === 'and' && !$result) return false;
        }

        if ($evaluated === 0) return false;

        return $logic === 'and';
    }

    /**
     * Evaluate a single condition against the field map and (optionally) the node.
     * Supports `source` (default), `inventory` and multi-row wildcard `source.*.field`.
     */
    public function evaluateSingleCondition(array $cond, array $fields, ?Node $node = null): bool
    {
        $type = $cond['type'] ?? 'source';
        $fieldValue = null;

        if ($type === 'inventory') {
            if ($node) {
                $fieldValue = $this->getInventoryValue(
                    $cond['inventoryCategoryId'] ?? null,
                    $cond['inventoryKey'] ?? null,
                    $cond['inventoryColumn'] ?? null,
                    $node
                );
            }
        } else {
            $source = $cond['source'] ?? '';
            $field = $cond['field'] ?? '$value';

            if (str_contains($field, '*.')) {
                $actualField = str_replace('*.', '', $field);
                $rows = $fields["$source.\$rows"] ?? null;
                if (is_array($rows) && !empty($rows)) {
                    $operator = $cond['operator'] ?? '';
                    $compareValue = $cond['value'] ?? null;
                    foreach ($rows as $row) {
                        $rowVal = isset($row[$actualField]) ? trim((string) $row[$actualField]) : null;
                        if (!$this->compareValue($rowVal, $operator, $compareValue)) {
                            return false;
                        }
                    }
                    return true;
                }
                return false;
            }

            $key = $source ? "$source.$field" : $field;
            $fieldValue = $fields[$key] ?? null;
        }

        return $this->compareValue($fieldValue, $cond['operator'] ?? '', $cond['value'] ?? null);
    }

    public function compareValue(mixed $fieldValue, string $operator, mixed $compareValue): bool
    {
        if (is_array($fieldValue)) {
            $fieldValue = json_encode($fieldValue);
        }

        return match ($operator) {
            'equals' => (string) $fieldValue === (string) $compareValue,
            'not_equals' => (string) $fieldValue !== (string) $compareValue,
            'exists' => $fieldValue !== null,
            'not_exists' => $fieldValue === null,
            'contains' => is_string($fieldValue) && str_contains($fieldValue, (string) $compareValue),
            'not_contains' => !is_string($fieldValue) || !str_contains($fieldValue, (string) $compareValue),
            'matches' => is_string($fieldValue) && (bool) @preg_match('~' . str_replace('~', '\\~', (string) $compareValue) . '~', $fieldValue),
            'greater_than' => is_numeric($fieldValue) && is_numeric($compareValue) && (float) $fieldValue > (float) $compareValue,
            'less_than' => is_numeric($fieldValue) && is_numeric($compareValue) && (float) $fieldValue < (float) $compareValue,
            'is_empty' => $fieldValue === null || $fieldValue === '' || $fieldValue === '[]',
            'is_not_empty' => $fieldValue !== null && $fieldValue !== '' && $fieldValue !== '[]',
            default => false,
        };
    }

    public function getInventoryValue(?int $categoryId, ?string $key, ?string $column, Node $node): ?string
    {
        if (!$categoryId || !$key) return null;

        $category = $this->em->getRepository(InventoryCategory::class)->find($categoryId);
        if (!$category) return null;

        $col = $column ?: 'Value#1';
        $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy([
            'node' => $node, 'category' => $category, 'entryKey' => $key, 'colLabel' => $col,
        ]);

        $values = array_map(fn(NodeInventoryEntry $e) => $e->getValue(), $entries);
        return empty($values) ? null : (count($values) === 1 ? $values[0] : implode(', ', $values));
    }
}

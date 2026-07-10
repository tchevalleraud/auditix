<?php

namespace App\Service;

use App\Entity\Node;
use App\Repository\NodeInventoryEntryRepository;

/**
 * Derives the list of physical units of a (possibly stacked) node from its
 * collected inventory. Nothing is stored: given the per-context mapping
 * (which InventoryCategory holds the units and which column labels carry each
 * unit's serial / model / version), this reads the node's "latest" inventory
 * snapshot and rebuilds one StackUnit per inventory entry key.
 *
 * Expected $stackConfig shape:
 *   [
 *     'categoryId'    => int,     // InventoryCategory holding the units
 *     'serialColumn'  => string,  // colLabel carrying the serial number
 *     'modelColumn'   => string,  // colLabel carrying the model
 *     'versionColumn' => string,  // optional colLabel carrying the version
 *   ]
 *
 * A node without stack data (feature off, config incomplete, or no matching
 * inventory rows) yields exactly one implicit unit built from the node's own
 * discoveredModel / discoveredVersion, so every caller can treat "node" and
 * "stack" uniformly (a plain node is simply a one-unit stack).
 */
class StackResolver
{
    public function __construct(private NodeInventoryEntryRepository $entries) {}

    /**
     * @return StackUnit[] ordered naturally by entry key (1, 2, 10 not 1, 10, 2)
     */
    public function resolveUnits(Node $node, ?array $stackConfig): array
    {
        $catId = isset($stackConfig['categoryId']) ? (int) $stackConfig['categoryId'] : 0;
        $serialCol = $this->str($stackConfig['serialColumn'] ?? null);
        $modelCol = $this->str($stackConfig['modelColumn'] ?? null);
        $versionCol = $this->str($stackConfig['versionColumn'] ?? null);

        // Feature not configured enough to derive units: fall back to the node.
        if ($catId === 0 || ($serialCol === null && $modelCol === null)) {
            return [$this->implicitUnit($node)];
        }

        // Build rows[entryKey][colLabel] = value from the latest snapshot,
        // restricted to the designated stack category.
        $rows = [];
        foreach ($this->entries->findLatestForNode($node) as $e) {
            if ($e->getCategory()?->getId() !== $catId) {
                continue;
            }
            $rows[$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
        }

        if ($rows === []) {
            return [$this->implicitUnit($node)];
        }

        $units = [];
        foreach ($rows as $key => $cols) {
            $units[] = new StackUnit(
                key: (string) $key,
                serial: $this->col($cols, $serialCol),
                model: $this->col($cols, $modelCol),
                version: $this->col($cols, $versionCol),
                columns: $cols,
            );
        }

        usort($units, static fn(StackUnit $a, StackUnit $b): int => strnatcasecmp($a->key, $b->key));

        return $units;
    }

    /** Whether the node actually resolves to more than one physical unit. */
    public function isStack(Node $node, ?array $stackConfig): bool
    {
        $units = $this->resolveUnits($node, $stackConfig);
        return count($units) > 1 || (isset($units[0]) && !$units[0]->implicit);
    }

    private function implicitUnit(Node $node): StackUnit
    {
        return new StackUnit(
            key: (string) ($node->getId() ?? '0'),
            serial: null,
            model: $node->getDiscoveredModel(),
            version: $node->getDiscoveredVersion(),
            columns: [],
            implicit: true,
        );
    }

    private function str(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $v = trim($v);
        return $v === '' ? null : $v;
    }

    /** Read a column value for a row, normalising empty strings to null. */
    private function col(array $cols, ?string $label): ?string
    {
        if ($label === null || $label === '') {
            return null;
        }
        $v = $cols[$label] ?? null;
        if ($v === null) {
            return null;
        }
        $v = trim((string) $v);
        return $v === '' ? null : $v;
    }
}

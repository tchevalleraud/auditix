<?php

namespace App\Service;

use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Repository\NodeInventoryEntryRepository;

/**
 * Derives ACL / ACE structures for a node from its collected inventory.
 *
 * Nothing is stored: given the per-context mapping (which InventoryCategory and
 * column labels hold each field), this reads the node's "latest" inventory
 * snapshot and rebuilds a list of ACLs, each with its ordered ACEs.
 *
 * Expected $aclConfig shape:
 *   [
 *     'aclSource' => ['categoryId' => int, 'idMode' => 'key'|'column', 'idCol' => string,
 *                     'nameCol' => string, 'typeCol' => string, 'defaultActionCol' => string,
 *                     'portsCol' => string, 'vlansCol' => string, 'vniCol' => string],
 *     'aceSource' => ['categoryId' => int, 'idMode' => 'key'|'column', 'idCol' => string,
 *                     'parentRefCol' => string, 'nameCol' => string,
 *                     'actionCol' => string, 'actionDelimiter' => string, 'qualifierCols' => string[],
 *                     'etherTypeCol' => string, 'sourceCol' => string,
 *                     'destinationCol' => string, 'enabledCol' => string],
 *   ]
 *
 * idMode controls how an ACL/ACE id is resolved: 'key' uses the inventory entry
 * key, 'column' reads it from a value column. ACEs link to their parent ACL when
 * their parentRefCol value matches the resolved ACL id.
 */
class AclExtractor
{
    public function __construct(private NodeInventoryEntryRepository $entries) {}

    /**
     * @return array<int, array{id: string, name: string, type: ?string, defaultAction: ?string, aces: array}>
     */
    public function extractForNode(Node $node, ?array $aclConfig): array
    {
        $aclSrc = $aclConfig['aclSource'] ?? null;
        $aceSrc = $aclConfig['aceSource'] ?? null;
        $aclCatId = isset($aclSrc['categoryId']) ? (int) $aclSrc['categoryId'] : 0;
        $aceCatId = isset($aceSrc['categoryId']) ? (int) $aceSrc['categoryId'] : 0;

        if (!$aclCatId && !$aceCatId) {
            return [];
        }

        // Build rows[categoryId][entryKey][colLabel] = value from the latest snapshot.
        $rows = [];
        foreach ($this->entries->findLatestForNode($node) as $e) {
            $catId = $e->getCategory()?->getId();
            if ($catId === null) {
                continue;
            }
            $rows[$catId][$e->getEntryKey()][$e->getColLabel()] = $e->getValue();
        }

        // ACLs, keyed by their resolved id so ACEs can be linked back to their parent.
        $acls = [];
        foreach ($rows[$aclCatId] ?? [] as $key => $cols) {
            $id = $this->resolveId($aclSrc, $cols, (string) $key);
            $acls[$id] = [
                'id' => $id,
                'name' => $this->col($cols, $aclSrc['nameCol'] ?? null) ?? $id,
                'type' => $this->col($cols, $aclSrc['typeCol'] ?? null),
                'defaultAction' => $this->col($cols, $aclSrc['defaultActionCol'] ?? null),
                'ports' => $this->splitList($this->col($cols, $aclSrc['portsCol'] ?? null)),
                'vlans' => $this->splitList($this->col($cols, $aclSrc['vlansCol'] ?? null)),
                'vni' => $this->col($cols, $aclSrc['vniCol'] ?? null),
                'aces' => [],
            ];
        }

        // ACEs linked to their parent ACL (auto-creating a minimal ACL if unknown).
        foreach ($rows[$aceCatId] ?? [] as $key => $cols) {
            $aceId = $this->resolveId($aceSrc, $cols, (string) $key);
            $parent = $this->col($cols, $aceSrc['parentRefCol'] ?? null);
            if ($parent === null || $parent === '') {
                $parent = '__unassigned__';
            }
            if (!isset($acls[$parent])) {
                $acls[$parent] = [
                    'id' => (string) $parent,
                    'name' => (string) $parent,
                    'type' => null,
                    'defaultAction' => null,
                    'ports' => [],
                    'vlans' => [],
                    'vni' => null,
                    'aces' => [],
                ];
            }
            [$action, $actions] = $this->resolveActions($aceSrc, $cols);
            $acls[$parent]['aces'][] = [
                'id' => $aceId,
                'name' => $this->col($cols, $aceSrc['nameCol'] ?? null) ?? $aceId,
                'action' => $action,
                'actions' => $actions,
                'etherType' => $this->col($cols, $aceSrc['etherTypeCol'] ?? null),
                'source' => $this->col($cols, $aceSrc['sourceCol'] ?? null),
                'destination' => $this->col($cols, $aceSrc['destinationCol'] ?? null),
                'enabled' => $this->parseBool($this->col($cols, $aceSrc['enabledCol'] ?? null)),
            ];
        }

        return array_values($acls);
    }

    /**
     * Resolve an ACL/ACE id from a row: either the inventory entry key (default)
     * or a value column when idMode is 'column'. Falls back to the entry key when
     * the configured column is empty.
     *
     * @param array<string, mixed>|null $src
     * @param array<string, ?string>    $cols
     */
    private function resolveId(?array $src, array $cols, string $entryKey): string
    {
        if (($src['idMode'] ?? 'key') === 'column') {
            return $this->col($cols, $src['idCol'] ?? null) ?? $entryKey;
        }
        return $entryKey;
    }

    /**
     * Resolve an ACE's actions in hybrid mode:
     *   - the primary action column (optionally split on a delimiter) yields the
     *     primary action plus any extra inline actions;
     *   - each configured qualifier column adds a label/value badge.
     *
     * @param array<string, mixed>|null $src
     * @param array<string, ?string>    $cols
     * @return array{0: ?string, 1: array<int, array{label: string, value: ?string}>}
     */
    private function resolveActions(?array $src, array $cols): array
    {
        $primary = null;
        $actions = [];

        $raw = $this->col($cols, $src['actionCol'] ?? null);
        if ($raw !== null) {
            $delim = $src['actionDelimiter'] ?? null;
            $tokens = ($delim !== null && $delim !== '')
                ? array_values(array_filter(array_map('trim', explode($delim, $raw)), fn($t) => $t !== ''))
                : [$raw];
            if ($tokens) {
                $primary = $tokens[0];
                foreach (array_slice($tokens, 1) as $tok) {
                    $actions[] = $this->splitToken($tok);
                }
            }
        }

        // Qualifier columns: a non-empty cell becomes a "colLabel: value" badge.
        foreach (($src['qualifierCols'] ?? []) as $qc) {
            if (!is_string($qc) || $qc === '') {
                continue;
            }
            $v = $this->col($cols, $qc);
            if ($v !== null) {
                $actions[] = ['label' => $qc, 'value' => $v];
            }
        }

        return [$primary, $actions];
    }

    /** Split an inline action token like "remark-dscp 46" or "name:value". */
    private function splitToken(string $tok): array
    {
        $tok = trim($tok);
        if (preg_match('/^(\S+)[:=\s]+(.+)$/', $tok, $m)) {
            return ['label' => $m[1], 'value' => trim($m[2])];
        }
        return ['label' => $tok, 'value' => null];
    }

    /** Split a delimited cell (comma/space/semicolon) into a clean list. */
    private function splitList(?string $v): array
    {
        if ($v === null) {
            return [];
        }
        $parts = preg_split('/[,;\s]+/', $v, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        return array_values(array_filter(array_map('trim', $parts), fn($p) => $p !== ''));
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
        $v = trim($v);
        return $v === '' ? null : $v;
    }

    /** Interpret a textual flag as a boolean; absent/unknown defaults to enabled. */
    private function parseBool(?string $v): bool
    {
        if ($v === null) {
            return true;
        }
        $v = strtolower(trim($v));
        if (in_array($v, ['0', 'false', 'no', 'disabled', 'disable', 'off', 'down', 'inactive'], true)) {
            return false;
        }
        return true;
    }
}

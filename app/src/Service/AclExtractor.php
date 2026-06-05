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
 *                     'actionCol' => string, 'actionDelimiter' => string, 'enabledCol' => string,
 *                     'entries' => [['role' => 'source'|'destination'|'service'|'protocol'
 *                                              |'port'|'portSrc'|'portDst'|'qualifier'|'detail',
 *                                    'column' => string], ...]],
 *   ]
 *
 * ACEs are rendered firewall-style. Each ACE row (dynamic key) yields one rule.
 * `entries` is an ordered add/remove list: every entry maps a role to a single
 * inventory column. Several "source" entries aggregate into the Source cell, etc.
 * Empty role -> "all". Roles: source / destination / service (firewall cells),
 * qualifier (action badge), detail (grouped extra parameters).
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
            [$primaryAction, $inlineActions] = $this->resolveActions($aceSrc, $cols);
            $roles = $this->resolveEntries($aceSrc['entries'] ?? null, $cols);

            $acls[$parent]['aces'][] = [
                'id' => $aceId,
                'name' => $this->col($cols, $aceSrc['nameCol'] ?? null) ?? $aceId,
                'action' => $primaryAction,
                // Inline actions split from the action cell, plus columns flagged
                // as the "qualifier" role.
                'actions' => array_merge($inlineActions, $roles['qualifier']),
                'enabled' => $this->parseBool($this->col($cols, $aceSrc['enabledCol'] ?? null)),
                // Firewall-style aggregated cells; each role may gather several
                // columns (e.g. src-ip + src-mac -> source). Empty -> UI shows "all".
                'source' => $roles['source'],
                'destination' => $roles['destination'],
                // L2 / standalone service columns (e.g. ARP-Request).
                'service' => $roles['service'],
                // L3 service split across columns: protocol (tcp/udp) + ports.
                // 'port' stays for back-compat (treated as destination port).
                'protocol' => $roles['protocol'],
                'port' => $roles['port'],
                'portSrc' => $roles['portSrc'],
                'portDst' => $roles['portDst'],
                // "detail" role columns, surfaced grouped by layer in the UI.
                'fields' => $roles['detail'],
            ];
        }

        // Sort ACLs by id, then their ACEs by id, using natural ordering so
        // numeric keys line up (100, 200, 1000 instead of 100, 1000, 200).
        $byId = static fn(array $a, array $b): int => strnatcasecmp((string) $a['id'], (string) $b['id']);
        usort($acls, $byId);
        foreach ($acls as &$acl) {
            usort($acl['aces'], $byId);
        }
        unset($acl);

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
     * Resolve an ACE's primary action plus any extra inline actions obtained by
     * splitting the action cell on the configured delimiter.
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

        return [$primary, $actions];
    }

    /**
     * Resolve the add/remove `entries` list into per-role {label, value} buckets.
     * Each entry maps a role to a single column; the row key is dynamic. Several
     * entries with the same role aggregate (e.g. src-ip + src-mac -> source).
     *
     * @param mixed                  $entries the configured entry list
     * @param array<string, ?string> $cols    the ACE row
     * @return array{source: array, destination: array, service: array, qualifier: array, detail: array}
     */
    private function resolveEntries(mixed $entries, array $cols): array
    {
        $out = [
            'source' => [], 'destination' => [], 'service' => [],
            'protocol' => [], 'port' => [], 'portSrc' => [], 'portDst' => [],
            'qualifier' => [], 'detail' => [],
        ];
        if (!is_array($entries)) {
            return $out;
        }
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $role = $entry['role'] ?? null;
            $column = $entry['column'] ?? null;
            if (!isset($out[$role]) || !is_string($column) || $column === '') {
                continue;
            }
            $v = $this->col($cols, $column);
            if ($v !== null) {
                $out[$role][] = ['label' => $column, 'value' => $v];
            }
        }
        return $out;
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

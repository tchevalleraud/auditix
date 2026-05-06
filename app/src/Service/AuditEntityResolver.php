<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

/**
 * Lightweight name/IP lookups for audit log enrichment. Uses raw DBAL with a
 * per-process cache so worker loops don't repeat lookups for the same entity.
 */
class AuditEntityResolver
{
    /** @var array<string,array<int,array<string,string|null>|null>> */
    private array $cache = [];

    private const CACHE_LIMIT_PER_TYPE = 512;

    public function __construct(private readonly Connection $connection) {}

    /** @return array{name?:string|null,ip?:string|null}|null */
    public function node(int $id): ?array
    {
        $row = $this->fetch(
            'node',
            $id,
            <<<'SQL'
                SELECT n.name, n.ip_address,
                       (SELECT inv.value FROM node_inventory_entry inv
                        INNER JOIN collection_tag ct ON ct.id = inv.collection_tag_id
                        WHERE inv.node_id = n.id
                          AND ct.name = 'latest'
                          AND inv.entry_key = 'SysName'
                          AND inv.col_label = 'Value#1'
                        LIMIT 1) AS sys_name
                FROM node n
                WHERE n.id = ?
            SQL
        );
        if ($row === null) {
            return null;
        }
        $name = $row['name'] ?? null;
        if ($name === null || $name === '') {
            $sys = $row['sys_name'] ?? null;
            $name = is_string($sys) && $sys !== '' ? $sys : null;
        }
        return [
            'name' => $name,
            'ip' => $row['ip_address'] ?? null,
        ];
    }

    public function policyName(int $id): ?string
    {
        return $this->fetchScalar('compliance_policy', $id, 'SELECT name FROM compliance_policy WHERE id = ?');
    }

    public function contextName(int $id): ?string
    {
        return $this->fetchScalar('context', $id, 'SELECT name FROM context WHERE id = ?');
    }

    /** @return array{node_id?:int|null}|null */
    public function collection(int $id): ?array
    {
        return $this->fetch('collection', $id, 'SELECT node_id FROM collection WHERE id = ?');
    }

    public function reportTitle(int $id): ?string
    {
        return $this->fetchScalar('report', $id, 'SELECT title FROM report WHERE id = ?');
    }

    public function mailReportName(int $id): ?string
    {
        return $this->fetchScalar('mail_report', $id, 'SELECT name FROM mail_report WHERE id = ?');
    }

    public function modelName(int $id): ?string
    {
        return $this->fetchScalar('device_model', $id, 'SELECT name FROM device_model WHERE id = ?');
    }

    /** @return array<string,mixed>|null */
    private function fetch(string $type, int $id, string $sql): ?array
    {
        if (array_key_exists($type, $this->cache) && array_key_exists($id, $this->cache[$type])) {
            return $this->cache[$type][$id];
        }
        try {
            $row = $this->connection->executeQuery($sql, [$id])->fetchAssociative() ?: null;
        } catch (\Throwable) {
            $row = null;
        }
        $this->store($type, $id, $row);
        return $row;
    }

    private function fetchScalar(string $type, int $id, string $sql): ?string
    {
        $row = $this->fetch($type, $id, $sql);
        if ($row === null) {
            return null;
        }
        $value = reset($row);
        return is_string($value) ? $value : null;
    }

    /**
     * @param array<string,mixed>|null $row
     */
    private function store(string $type, int $id, ?array $row): void
    {
        if (!isset($this->cache[$type])) {
            $this->cache[$type] = [];
        }
        if (count($this->cache[$type]) >= self::CACHE_LIMIT_PER_TYPE) {
            array_shift($this->cache[$type]);
        }
        $this->cache[$type][$id] = $row;
    }
}

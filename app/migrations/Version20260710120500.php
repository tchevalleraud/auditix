<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Data migration companion to Version20260710120000: the free-text productModel
 * field is gone, so any stored rule that referenced it must now reference
 * discoveredModel instead. This rewrites the JSON of:
 *   - compliance_policy.match_rules  (blocks[].conditions[].field)
 *   - report_schema.elements         (chart dimensions .kind/.dim, inventory
 *                                     auto-selection rules .type)
 * Only the value "productModel" under a rule-field key is converted; unrelated
 * strings are left untouched.
 */
final class Version20260710120500 extends AbstractMigration
{
    /** Keys whose value selects a node field and may hold "productModel". */
    private const FIELD_KEYS = ['field', 'type', 'kind', 'dim', 'dimension'];

    public function getDescription(): string
    {
        return 'Convert stored productModel references to discoveredModel in compliance match rules and report elements';
    }

    public function up(Schema $schema): void
    {
        $this->rewriteColumn('compliance_policy', 'match_rules');
        $this->rewriteColumn('report_schema', 'elements');
    }

    public function down(Schema $schema): void
    {
        // Non-reversible: discoveredModel is a legitimate value on its own, so we
        // cannot safely tell converted rows apart from originally-discoveredModel
        // ones. No-op.
    }

    private function rewriteColumn(string $table, string $column): void
    {
        $rows = $this->connection->fetchAllAssociative(
            sprintf('SELECT id, %s AS payload FROM %s WHERE %s IS NOT NULL', $column, $table, $column)
        );

        foreach ($rows as $row) {
            $data = json_decode((string) $row['payload'], true);
            if (!is_array($data)) {
                continue;
            }

            $changed = false;
            $data = $this->convert($data, $changed);
            if (!$changed) {
                continue;
            }

            $this->addSql(
                sprintf('UPDATE %s SET %s = :payload WHERE id = :id', $table, $column),
                ['payload' => json_encode($data), 'id' => $row['id']]
            );
        }
    }

    /**
     * Recursively replace "productModel" with "discoveredModel" wherever it is
     * the value of a field-selector key.
     */
    private function convert(mixed $node, bool &$changed): mixed
    {
        if (!is_array($node)) {
            return $node;
        }

        foreach ($node as $key => $value) {
            if (is_array($value)) {
                $node[$key] = $this->convert($value, $changed);
                continue;
            }
            if (in_array($key, self::FIELD_KEYS, true) && $value === 'productModel') {
                $node[$key] = 'discoveredModel';
                $changed = true;
            }
        }

        return $node;
    }
}

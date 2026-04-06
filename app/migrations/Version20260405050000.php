<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260405050000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Refactor compliance_rule: replace single source fields with data_sources JSON array, migrate condition_tree format';
    }

    public function up(Schema $schema): void
    {
        // 1. Add new column
        $this->addSql("ALTER TABLE compliance_rule ADD COLUMN data_sources JSON NOT NULL DEFAULT '[]'");

        // 2. Migrate collection/ssh sources → data_sources array with name='default'
        $this->addSql("
            UPDATE compliance_rule
            SET data_sources = json_build_array(json_build_object(
                'name', 'default',
                'type', source_type,
                'command', source_command,
                'tag', source_tag,
                'regex', source_regex,
                'resultMode', source_result_mode,
                'valueMap', COALESCE(source_value_map, 'null'::json),
                'keyGroup', source_key_group
            ))
            WHERE source_type IN ('collection', 'ssh')
        ");

        // 3. Migrate condition_tree for collection/ssh rules:
        //    old format: { field: '$value', operator: '...', value: '...' }
        //    new format: { type: 'source', source: 'default', field: '$value', operator: '...', value: '...' }
        //    We do this with a text replacement on the JSON
        $this->addSql("
            UPDATE compliance_rule
            SET condition_tree = REPLACE(
                REPLACE(condition_tree::text, '\"field\":', '\"type\":\"source\",\"source\":\"default\",\"field\":'),
                '\"nodeId\"', '\"nodeId\"'
            )::json
            WHERE source_type IN ('collection', 'ssh') AND condition_tree IS NOT NULL
        ");

        // 4. Migrate inventory rules: conditions become type=inventory with category/key/column
        //    This is done per-rule in PHP since we need the source_category_id, source_key, source_value
        $rows = $this->connection->fetchAllAssociative("
            SELECT id, source_category_id, source_key, source_value, condition_tree
            FROM compliance_rule
            WHERE source_type = 'inventory' AND condition_tree IS NOT NULL
        ");

        foreach ($rows as $row) {
            $catId = $row['source_category_id'];
            $key = $row['source_key'] ?? '';
            $col = $row['source_value'] ?: 'Value#1';
            $tree = json_decode($row['condition_tree'], true);

            if ($tree && isset($tree['blocks'])) {
                $this->migrateInventoryBlocks($tree['blocks'], $catId, $key, $col);
                $this->addSql(
                    'UPDATE compliance_rule SET condition_tree = ? WHERE id = ?',
                    [json_encode($tree), $row['id']]
                );
            }
        }

        // 5. For 'none' type rules, data_sources stays '[]', no condition migration needed

        // 6. Drop old columns
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_type');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_category_id');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_key');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_value');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_command');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_tag');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_regex');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_result_mode');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_value_map');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS source_key_group');
    }

    private function migrateInventoryBlocks(array &$blocks, ?int $catId, string $key, string $col): void
    {
        foreach ($blocks as &$block) {
            if (isset($block['conditions'])) {
                foreach ($block['conditions'] as &$cond) {
                    if (isset($cond['field']) && !isset($cond['type'])) {
                        // Convert old inventory condition to new format
                        $oldField = $cond['field'];
                        unset($cond['field']);
                        $cond['type'] = 'inventory';
                        $cond['inventoryCategoryId'] = $catId;
                        $cond['inventoryKey'] = $key;
                        $cond['inventoryColumn'] = $col;
                    }
                }
            }
            if (!empty($block['children'])) {
                $this->migrateInventoryBlocks($block['children'], $catId, $key, $col);
            }
        }
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE compliance_rule ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'none'");
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_category_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_key VARCHAR(500) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_value VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_command VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_tag VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_regex VARCHAR(1000) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_result_mode VARCHAR(20) DEFAULT NULL');
        $this->addSql("ALTER TABLE compliance_rule ADD COLUMN source_value_map JSON DEFAULT NULL");
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN source_key_group INT DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN data_sources');
    }
}

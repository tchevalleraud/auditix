<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Product Range rework:
 *  - Product ranges are now matched from the node's discoveredModel (and, for a
 *    stack, from the inventory model column), so the free-text node.product_model
 *    field is dropped everywhere.
 *  - The resolved range is persisted as a proper variable: node.product_range_id
 *    (single node / stack composite) plus node.stack_unit_ranges (per-unit map).
 *  - product_range.model_patterns holds regex patterns used to match discovered
 *    models in priority over the name-prefix heuristic.
 *  - Drops the orphan device_model.product_range_id column (mapped by no entity,
 *    left over from an earlier design).
 */
final class Version20260710120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Product Range rework: drop node.product_model, add node.product_range_id + stack_unit_ranges, product_range.model_patterns; drop orphan device_model.product_range_id';
    }

    public function up(Schema $schema): void
    {
        // Resolved product range on the node (persisted variable).
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS product_range_id INT DEFAULT NULL REFERENCES product_range(id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_node_product_range ON node (product_range_id)');
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS stack_unit_ranges JSON DEFAULT NULL');

        // Regex patterns for reliable model→range matching.
        $this->addSql('ALTER TABLE product_range ADD COLUMN IF NOT EXISTS model_patterns JSON DEFAULT NULL');

        // Matching now runs on discovered_model — drop the free-text product model.
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS product_model');

        // Orphan column from an earlier ProductRange↔DeviceModel design (no entity mapping).
        $this->addSql('DROP INDEX IF EXISTS idx_device_model_product_range');
        $this->addSql('ALTER TABLE device_model DROP COLUMN IF EXISTS product_range_id');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model ADD COLUMN IF NOT EXISTS product_range_id INT DEFAULT NULL REFERENCES product_range(id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_device_model_product_range ON device_model (product_range_id)');

        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS product_model VARCHAR(255) DEFAULT NULL');

        $this->addSql('ALTER TABLE product_range DROP COLUMN IF EXISTS model_patterns');

        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS stack_unit_ranges');
        $this->addSql('DROP INDEX IF EXISTS idx_node_product_range');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS product_range_id');
    }
}

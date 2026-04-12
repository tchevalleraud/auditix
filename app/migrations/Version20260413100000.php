<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260413100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add product_range, vendor_plugin tables and system_update fields on node/device_model/context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS product_range (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            manufacturer_id INT NOT NULL REFERENCES editor(id) ON DELETE CASCADE,
            context_id INT NOT NULL REFERENCES context(id) ON DELETE CASCADE,
            recommended_version VARCHAR(50) DEFAULT NULL,
            current_version VARCHAR(50) DEFAULT NULL,
            release_date TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            end_of_sale_date TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            end_of_support_date TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            end_of_life_date TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            plugin_source VARCHAR(100) DEFAULT NULL,
            last_synced_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        )');
        $this->addSql('CREATE INDEX idx_product_range_context ON product_range (context_id)');
        $this->addSql('CREATE INDEX idx_product_range_manufacturer ON product_range (manufacturer_id)');

        $this->addSql('CREATE TABLE IF NOT EXISTS vendor_plugin (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL REFERENCES context(id) ON DELETE CASCADE,
            plugin_identifier VARCHAR(100) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            last_sync_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            last_sync_status VARCHAR(20) DEFAULT NULL,
            configuration JSON DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uniq_vendor_plugin_context UNIQUE (context_id, plugin_identifier)
        )');

        $this->addSql('ALTER TABLE device_model ADD COLUMN IF NOT EXISTS product_range_id INT DEFAULT NULL REFERENCES product_range(id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_device_model_product_range ON device_model (product_range_id)');

        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS system_update_score VARCHAR(1) DEFAULT NULL');

        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS system_update_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS system_update_score_weight DOUBLE PRECISION NOT NULL DEFAULT 0.0');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS system_update_score_weight');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS system_update_enabled');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS system_update_score');
        $this->addSql('ALTER TABLE device_model DROP COLUMN IF EXISTS product_range_id');
        $this->addSql('DROP TABLE IF EXISTS vendor_plugin');
        $this->addSql('DROP TABLE IF EXISTS product_range');
    }
}

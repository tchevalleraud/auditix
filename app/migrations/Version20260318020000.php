<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260318020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add SNMP monitoring data table with BRIN index and retention setting on context';
    }

    public function up(Schema $schema): void
    {
        // Add retention setting to context
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS snmp_retention_minutes INT NOT NULL DEFAULT 120');

        // Create SNMP monitoring data table optimized for time-series
        $this->addSql('CREATE TABLE IF NOT EXISTS snmp_monitoring_data (
            id BIGSERIAL PRIMARY KEY,
            node_id INT NOT NULL,
            category VARCHAR(50) NOT NULL,
            oid VARCHAR(255) NOT NULL,
            raw_value TEXT NOT NULL,
            numeric_value DOUBLE PRECISION,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_snmp_data_node FOREIGN KEY (node_id) REFERENCES node(id) ON DELETE CASCADE
        )');

        // BRIN index: highly efficient for time-ordered append-only data (much smaller than B-tree)
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_snmp_data_recorded_at_brin ON snmp_monitoring_data USING BRIN (recorded_at)');

        // Composite B-tree for per-node/category queries within a time range
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_snmp_data_node_cat_time ON snmp_monitoring_data (node_id, category, recorded_at)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS snmp_monitoring_data');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS snmp_retention_minutes');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add topology_cluster_rule + topology_cluster.cluster_rule_id for inventory-driven cluster generators.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_cluster_rule (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                inventory_category_id INTEGER DEFAULT NULL,
                group_by_column VARCHAR(255) NOT NULL DEFAULT '',
                cluster_style JSON NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                last_generated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                CONSTRAINT fk_topology_cluster_rule_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_cluster_rule_inv_cat FOREIGN KEY (inventory_category_id) REFERENCES inventory_category (id) ON DELETE SET NULL
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_rule_topology ON topology_cluster_rule (topology_id)');

        $this->addSql('ALTER TABLE topology_cluster ADD COLUMN IF NOT EXISTS cluster_rule_id INTEGER DEFAULT NULL');
        $this->addSql(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_topology_cluster_rule') THEN
                    ALTER TABLE topology_cluster ADD CONSTRAINT fk_topology_cluster_rule
                        FOREIGN KEY (cluster_rule_id) REFERENCES topology_cluster_rule (id) ON DELETE SET NULL;
                END IF;
            END $$;
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_rule_id ON topology_cluster (cluster_rule_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_cluster DROP CONSTRAINT IF EXISTS fk_topology_cluster_rule');
        $this->addSql('DROP INDEX IF EXISTS idx_topology_cluster_rule_id');
        $this->addSql('ALTER TABLE topology_cluster DROP COLUMN IF EXISTS cluster_rule_id');
        $this->addSql('DROP TABLE IF EXISTS topology_cluster_rule');
    }
}

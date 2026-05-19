<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create topology_protocol + topology_edge.protocol_id for auto-generated links from inventory.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_protocol (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(32) NOT NULL,
                inventory_category_id INTEGER DEFAULT NULL,
                mapping JSON NOT NULL,
                edge_style JSON NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                last_generated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
                CONSTRAINT fk_topology_protocol_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_protocol_inv_cat FOREIGN KEY (inventory_category_id) REFERENCES inventory_category (id) ON DELETE SET NULL
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_protocol_topology ON topology_protocol (topology_id)');

        $this->addSql('ALTER TABLE topology_edge ADD COLUMN IF NOT EXISTS protocol_id INTEGER DEFAULT NULL');
        $this->addSql(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_topology_edge_protocol') THEN
                    ALTER TABLE topology_edge ADD CONSTRAINT fk_topology_edge_protocol
                        FOREIGN KEY (protocol_id) REFERENCES topology_protocol (id) ON DELETE SET NULL;
                END IF;
            END $$;
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_edge_protocol ON topology_edge (protocol_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_edge DROP CONSTRAINT IF EXISTS fk_topology_edge_protocol');
        $this->addSql('DROP INDEX IF EXISTS idx_topology_edge_protocol');
        $this->addSql('ALTER TABLE topology_edge DROP COLUMN IF EXISTS protocol_id');
        $this->addSql('DROP TABLE IF EXISTS topology_protocol');
    }
}

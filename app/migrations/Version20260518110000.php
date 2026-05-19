<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create topology_edge for manually-defined links between topology nodes.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_edge (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                source_node_id INTEGER NOT NULL,
                target_node_id INTEGER NOT NULL,
                style JSON NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_topology_edge_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_edge_source FOREIGN KEY (source_node_id) REFERENCES node (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_edge_target FOREIGN KEY (target_node_id) REFERENCES node (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_edge_topology ON topology_edge (topology_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_edge_source ON topology_edge (source_node_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_edge_target ON topology_edge (target_node_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_edge');
    }
}

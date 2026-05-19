<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create topology_cluster + topology_cluster_member for grouping nodes visually.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_cluster (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                style JSON NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_topology_cluster_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_topology ON topology_cluster (topology_id)');

        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_cluster_member (
                id SERIAL PRIMARY KEY,
                cluster_id INTEGER NOT NULL,
                node_id INTEGER NOT NULL,
                CONSTRAINT fk_topology_cluster_member_cluster FOREIGN KEY (cluster_id) REFERENCES topology_cluster (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_cluster_member_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE,
                CONSTRAINT uniq_cluster_node_pair UNIQUE (cluster_id, node_id)
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_member_cluster ON topology_cluster_member (cluster_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_member_node ON topology_cluster_member (node_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_cluster_member');
        $this->addSql('DROP TABLE IF EXISTS topology_cluster');
    }
}

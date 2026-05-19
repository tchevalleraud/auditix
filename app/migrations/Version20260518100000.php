<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create topology + topology_node tables for the new interactive topology editor.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology (
                id SERIAL PRIMARY KEY,
                context_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                node_design JSON NOT NULL,
                layout JSON DEFAULT NULL,
                viewport JSON DEFAULT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_topology_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_context ON topology (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_context_primary ON topology (context_id, is_primary)');

        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_node (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                node_id INTEGER NOT NULL,
                style_override JSON DEFAULT NULL,
                added_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_topology_node_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE,
                CONSTRAINT fk_topology_node_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE,
                CONSTRAINT uniq_topology_node_pair UNIQUE (topology_id, node_id)
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_node_topology ON topology_node (topology_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_node_node ON topology_node (node_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_node');
        $this->addSql('DROP TABLE IF EXISTS topology');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create node_tag table and node_node_tag join table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS node_tag (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, color VARCHAR(7) NOT NULL DEFAULT \'#6b7280\', context_id INT NOT NULL REFERENCES context(id) ON DELETE CASCADE, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL)');
        $this->addSql('COMMENT ON COLUMN node_tag.created_at IS \'(DC2Type:datetime_immutable)\'');
        $this->addSql('CREATE TABLE IF NOT EXISTS node_node_tag (node_id INT NOT NULL REFERENCES node(id) ON DELETE CASCADE, node_tag_id INT NOT NULL REFERENCES node_tag(id) ON DELETE CASCADE, PRIMARY KEY(node_id, node_tag_id))');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_node_node_tag_node ON node_node_tag (node_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_node_node_tag_tag ON node_node_tag (node_tag_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE node_node_tag');
        $this->addSql('DROP TABLE node_tag');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260430100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add condition_tree on collection_rule and create node_dynamic_tag table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule ADD COLUMN IF NOT EXISTS condition_tree JSON DEFAULT NULL');

        $this->addSql('CREATE TABLE IF NOT EXISTS node_dynamic_tag (
            id SERIAL PRIMARY KEY,
            node_id INT NOT NULL,
            tag_id INT NOT NULL,
            rule_id INT DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL
        )');
        $this->addSql("COMMENT ON COLUMN node_dynamic_tag.created_at IS '(DC2Type:datetime_immutable)'");
        $this->addSql('CREATE UNIQUE INDEX IF NOT EXISTS node_dynamic_tag_unique ON node_dynamic_tag (node_id, tag_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_node_dynamic_tag_node ON node_dynamic_tag (node_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_node_dynamic_tag_tag ON node_dynamic_tag (tag_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_node_dynamic_tag_rule ON node_dynamic_tag (rule_id)');
        $this->addSql('ALTER TABLE node_dynamic_tag ADD CONSTRAINT fk_node_dynamic_tag_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('ALTER TABLE node_dynamic_tag ADD CONSTRAINT fk_node_dynamic_tag_tag FOREIGN KEY (tag_id) REFERENCES node_tag (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('ALTER TABLE node_dynamic_tag ADD CONSTRAINT fk_node_dynamic_tag_rule FOREIGN KEY (rule_id) REFERENCES collection_rule (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS node_dynamic_tag');
        $this->addSql('ALTER TABLE collection_rule DROP COLUMN IF EXISTS condition_tree');
    }
}

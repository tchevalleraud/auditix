<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260506110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Promote collection tags to relational entity; bind inventory entries to a collection tag for per-tag history';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE collection_tag (
            id SERIAL PRIMARY KEY,
            collection_id INT NOT NULL,
            node_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        )');
        $this->addSql("COMMENT ON COLUMN collection_tag.created_at IS '(DC2Type:datetime_immutable)'");
        $this->addSql('CREATE UNIQUE INDEX uniq_collection_tag_node_name ON collection_tag (node_id, name)');
        $this->addSql('CREATE UNIQUE INDEX uniq_collection_tag_collection_name ON collection_tag (collection_id, name)');
        $this->addSql('CREATE INDEX idx_collection_tag_name ON collection_tag (name)');
        $this->addSql('ALTER TABLE collection_tag ADD CONSTRAINT fk_collection_tag_collection FOREIGN KEY (collection_id) REFERENCES collection (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');
        $this->addSql('ALTER TABLE collection_tag ADD CONSTRAINT fk_collection_tag_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');

        // Migrate tags from JSON column to relational rows.
        // For each (node_id, tag_name), keep the most recently completed (or created) collection holding that tag.
        $this->addSql("
            INSERT INTO collection_tag (collection_id, node_id, name, created_at)
            SELECT DISTINCT ON (c.node_id, t.name)
                c.id, c.node_id, t.name, c.created_at
            FROM collection c, jsonb_array_elements_text(c.tags::jsonb) AS t(name)
            WHERE c.tags IS NOT NULL AND c.tags::text <> '[]'
            ORDER BY c.node_id, t.name, c.completed_at DESC NULLS LAST, c.created_at DESC
        ");

        // Add collection_tag_id to node_inventory_entry (nullable for backfill).
        $this->addSql('ALTER TABLE node_inventory_entry ADD COLUMN collection_tag_id INT DEFAULT NULL');

        // Backfill: existing entries belong to the "latest" collection (current behaviour overwrites the table on each collect).
        $this->addSql("
            UPDATE node_inventory_entry e
            SET collection_tag_id = ct.id
            FROM collection_tag ct
            WHERE ct.node_id = e.node_id AND ct.name = 'latest'
        ");

        // Remove orphaned entries (nodes without a 'latest' tag).
        $this->addSql('DELETE FROM node_inventory_entry WHERE collection_tag_id IS NULL');

        // Make column NOT NULL + add FK with CASCADE.
        $this->addSql('ALTER TABLE node_inventory_entry ALTER COLUMN collection_tag_id SET NOT NULL');
        $this->addSql('ALTER TABLE node_inventory_entry ADD CONSTRAINT fk_inventory_collection_tag FOREIGN KEY (collection_tag_id) REFERENCES collection_tag (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE');

        // Drop legacy unique on node and replace with the per-tag unique.
        $this->addSql('ALTER TABLE node_inventory_entry DROP CONSTRAINT IF EXISTS node_cat_key_col');
        $this->addSql('DROP INDEX IF EXISTS node_cat_key_col');
        $this->addSql('CREATE UNIQUE INDEX uniq_inventory_tag_cat_key_col ON node_inventory_entry (collection_tag_id, category_id, entry_key, col_label)');
        $this->addSql('CREATE INDEX idx_inventory_node_tag ON node_inventory_entry (node_id, collection_tag_id)');

        // Drop legacy collection_id column from node_inventory_entry (replaced by collection_tag_id).
        $this->addSql('ALTER TABLE node_inventory_entry DROP CONSTRAINT IF EXISTS fk_3a55c3c0514956fd');
        $this->addSql('ALTER TABLE node_inventory_entry DROP COLUMN IF EXISTS collection_id');

        // Drop legacy tags JSON column from collection.
        $this->addSql('ALTER TABLE collection DROP COLUMN tags');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection ADD COLUMN tags JSON DEFAULT \'[]\'::json NOT NULL');
        $this->addSql("
            UPDATE collection c
            SET tags = COALESCE((
                SELECT json_agg(ct.name)
                FROM collection_tag ct
                WHERE ct.collection_id = c.id
            ), '[]'::json)
        ");

        $this->addSql('ALTER TABLE node_inventory_entry ADD COLUMN collection_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE node_inventory_entry ADD CONSTRAINT fk_3a55c3c0514956fd FOREIGN KEY (collection_id) REFERENCES collection (id) ON DELETE SET NULL NOT DEFERRABLE INITIALLY IMMEDIATE');

        $this->addSql('DROP INDEX IF EXISTS idx_inventory_node_tag');
        $this->addSql('DROP INDEX IF EXISTS uniq_inventory_tag_cat_key_col');
        $this->addSql('CREATE UNIQUE INDEX node_cat_key_col ON node_inventory_entry (node_id, category_id, entry_key, col_label)');

        $this->addSql('ALTER TABLE node_inventory_entry DROP CONSTRAINT IF EXISTS fk_inventory_collection_tag');
        $this->addSql('ALTER TABLE node_inventory_entry DROP COLUMN collection_tag_id');

        $this->addSql('DROP TABLE IF EXISTS collection_tag');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260502100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Schedule: split collection into collect/extract phases, shared node selection (all/tag/individual); Collection: extract status tracking';
    }

    public function up(Schema $schema): void
    {
        // Schedule: new fields
        $this->addSql('ALTER TABLE schedule ADD COLUMN node_selection_mode VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE schedule ADD COLUMN node_tag_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE schedule ADD COLUMN node_ids JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE schedule ADD COLUMN collect_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE schedule ADD COLUMN extract_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE schedule ADD COLUMN compliance_enabled BOOLEAN NOT NULL DEFAULT FALSE');

        // Data migration: convert legacy collection_node_ids / compliance_node_ids
        $this->addSql(<<<'SQL'
UPDATE schedule
SET node_selection_mode = 'individual',
    collect_enabled = (collection_node_ids IS NOT NULL AND collection_node_ids::text != '[]'),
    extract_enabled = (collection_node_ids IS NOT NULL AND collection_node_ids::text != '[]'),
    compliance_enabled = (compliance_node_ids IS NOT NULL AND compliance_node_ids::text != '[]'),
    node_ids = (
      SELECT jsonb_agg(DISTINCT id)
      FROM (
        SELECT (jsonb_array_elements_text(COALESCE(collection_node_ids, '[]')::jsonb))::int AS id
        UNION
        SELECT (jsonb_array_elements_text(COALESCE(compliance_node_ids, '[]')::jsonb))::int AS id
      ) merged
      WHERE id IS NOT NULL
    )
WHERE collection_node_ids IS NOT NULL OR compliance_node_ids IS NOT NULL
SQL);

        // In-flight schedules in 'collection' phase: rebase to 'collect'
        $this->addSql("UPDATE schedule SET current_phase = 'collect' WHERE current_phase = 'collection'");

        // Drop legacy columns
        $this->addSql('ALTER TABLE schedule DROP COLUMN collection_node_ids');
        $this->addSql('ALTER TABLE schedule DROP COLUMN compliance_node_ids');

        // Collection: extract tracking
        $this->addSql('ALTER TABLE collection ADD COLUMN extract_status VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE collection ADD COLUMN last_extracted_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('ALTER TABLE collection ADD COLUMN extract_error TEXT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection DROP COLUMN IF EXISTS extract_error');
        $this->addSql('ALTER TABLE collection DROP COLUMN IF EXISTS last_extracted_at');
        $this->addSql('ALTER TABLE collection DROP COLUMN IF EXISTS extract_status');

        $this->addSql('ALTER TABLE schedule ADD COLUMN compliance_node_ids JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE schedule ADD COLUMN collection_node_ids JSON DEFAULT NULL');

        $this->addSql("UPDATE schedule SET current_phase = 'collection' WHERE current_phase IN ('collect', 'extract')");
        $this->addSql(<<<'SQL'
UPDATE schedule
SET collection_node_ids = CASE WHEN collect_enabled OR extract_enabled THEN node_ids ELSE NULL END,
    compliance_node_ids = CASE WHEN compliance_enabled THEN node_ids ELSE NULL END
WHERE node_ids IS NOT NULL
SQL);

        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS compliance_enabled');
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS extract_enabled');
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS collect_enabled');
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS node_ids');
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS node_tag_id');
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS node_selection_mode');
    }
}

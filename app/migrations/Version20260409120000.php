<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Topology Phase 5: add folder hierarchy for topology collection rules + backfill auto-folders for existing manufacturers and models';
    }

    public function up(Schema $schema): void
    {
        // 1. Folder table
        $this->addSql('CREATE TABLE IF NOT EXISTS topology_collection_rule_folder (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL,
            parent_id INT DEFAULT NULL,
            manufacturer_id INT DEFAULT NULL,
            model_id INT DEFAULT NULL,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(20) NOT NULL DEFAULT \'custom\',
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_topo_rule_folder_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE,
            CONSTRAINT fk_topo_rule_folder_parent FOREIGN KEY (parent_id) REFERENCES topology_collection_rule_folder(id) ON DELETE CASCADE,
            CONSTRAINT fk_topo_rule_folder_manufacturer FOREIGN KEY (manufacturer_id) REFERENCES editor(id) ON DELETE CASCADE,
            CONSTRAINT fk_topo_rule_folder_model FOREIGN KEY (model_id) REFERENCES device_model(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topo_rule_folder_context ON topology_collection_rule_folder (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topo_rule_folder_parent ON topology_collection_rule_folder (parent_id)');

        // 2. Add folder_id to topology_collection_rule
        $this->addSql('ALTER TABLE topology_collection_rule ADD COLUMN IF NOT EXISTS folder_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE topology_collection_rule DROP CONSTRAINT IF EXISTS fk_topo_rule_folder');
        $this->addSql('ALTER TABLE topology_collection_rule ADD CONSTRAINT fk_topo_rule_folder FOREIGN KEY (folder_id) REFERENCES topology_collection_rule_folder(id) ON DELETE CASCADE');

        // 3. Backfill auto-folders for existing Editors (manufacturers).
        // For each editor, create a TYPE_MANUFACTURER folder if it doesn't already exist.
        $this->addSql("
            INSERT INTO topology_collection_rule_folder (context_id, parent_id, manufacturer_id, model_id, name, type, created_at)
            SELECT e.context_id, NULL, e.id, NULL, e.name, 'manufacturer', NOW()
            FROM editor e
            WHERE NOT EXISTS (
                SELECT 1 FROM topology_collection_rule_folder f
                WHERE f.manufacturer_id = e.id AND f.type = 'manufacturer'
            )
        ");

        // 4. Backfill auto-folders for existing DeviceModels.
        // Each model becomes a TYPE_MODEL folder under its manufacturer's folder.
        $this->addSql("
            INSERT INTO topology_collection_rule_folder (context_id, parent_id, manufacturer_id, model_id, name, type, created_at)
            SELECT m.context_id, mf.id, m.manufacturer_id, m.id, m.name, 'model', NOW()
            FROM device_model m
            JOIN topology_collection_rule_folder mf
                ON mf.manufacturer_id = m.manufacturer_id
                AND mf.type = 'manufacturer'
            WHERE NOT EXISTS (
                SELECT 1 FROM topology_collection_rule_folder f
                WHERE f.model_id = m.id AND f.type = 'model'
            )
        ");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_collection_rule DROP CONSTRAINT IF EXISTS fk_topo_rule_folder');
        $this->addSql('ALTER TABLE topology_collection_rule DROP COLUMN IF EXISTS folder_id');
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule_folder');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Topology Phase 2: create topology_collection_rule and join table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS topology_collection_rule (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            protocol VARCHAR(20) NOT NULL,
            source VARCHAR(10) NOT NULL DEFAULT \'local\',
            command VARCHAR(500) NOT NULL,
            tag VARCHAR(255) DEFAULT NULL,
            parser_type VARCHAR(10) NOT NULL DEFAULT \'block\',
            parser_config JSON NOT NULL DEFAULT \'{}\',
            link_mapping JSON NOT NULL DEFAULT \'{}\',
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_topo_rule_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topo_collect_rule_context ON topology_collection_rule (context_id)');

        $this->addSql('CREATE TABLE IF NOT EXISTS topology_collection_rule_model (
            topology_collection_rule_id INT NOT NULL,
            device_model_id INT NOT NULL,
            PRIMARY KEY (topology_collection_rule_id, device_model_id),
            CONSTRAINT fk_topo_rule_model_rule FOREIGN KEY (topology_collection_rule_id) REFERENCES topology_collection_rule(id) ON DELETE CASCADE,
            CONSTRAINT fk_topo_rule_model_model FOREIGN KEY (device_model_id) REFERENCES device_model(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topo_rule_model_model ON topology_collection_rule_model (device_model_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule_model');
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule');
    }
}

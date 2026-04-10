<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Topology Phase 1: create topology_map, topology_device and topology_link tables';
    }

    public function up(Schema $schema): void
    {
        // topology_map
        $this->addSql('CREATE TABLE IF NOT EXISTS topology_map (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            default_protocol VARCHAR(20) DEFAULT NULL,
            layout JSON DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            last_refreshed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            CONSTRAINT fk_topology_map_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_map_context ON topology_map (context_id)');

        // topology_device
        $this->addSql('CREATE TABLE IF NOT EXISTS topology_device (
            id SERIAL PRIMARY KEY,
            map_id INT NOT NULL,
            node_id INT DEFAULT NULL,
            name VARCHAR(255) NOT NULL,
            chassis_id VARCHAR(100) DEFAULT NULL,
            mgmt_address VARCHAR(45) DEFAULT NULL,
            sys_descr TEXT DEFAULT NULL,
            CONSTRAINT fk_topology_device_map FOREIGN KEY (map_id) REFERENCES topology_map(id) ON DELETE CASCADE,
            CONSTRAINT fk_topology_device_node FOREIGN KEY (node_id) REFERENCES node(id) ON DELETE SET NULL
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_device_map ON topology_device (map_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_device_node ON topology_device (node_id)');

        // topology_link
        $this->addSql('CREATE TABLE IF NOT EXISTS topology_link (
            id SERIAL PRIMARY KEY,
            map_id INT NOT NULL,
            source_device_id INT NOT NULL,
            target_device_id INT NOT NULL,
            protocol VARCHAR(20) NOT NULL,
            source_port VARCHAR(100) DEFAULT NULL,
            target_port VARCHAR(100) DEFAULT NULL,
            status VARCHAR(20) DEFAULT NULL,
            weight INT DEFAULT NULL,
            metadata JSON DEFAULT NULL,
            discovered_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_topology_link_map FOREIGN KEY (map_id) REFERENCES topology_map(id) ON DELETE CASCADE,
            CONSTRAINT fk_topology_link_source FOREIGN KEY (source_device_id) REFERENCES topology_device(id) ON DELETE CASCADE,
            CONSTRAINT fk_topology_link_target FOREIGN KEY (target_device_id) REFERENCES topology_device(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_link_map ON topology_link (map_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_link_source ON topology_link (source_device_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_link_target ON topology_link (target_device_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_link');
        $this->addSql('DROP TABLE IF EXISTS topology_device');
        $this->addSql('DROP TABLE IF EXISTS topology_map');
    }
}

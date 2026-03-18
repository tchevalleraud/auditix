<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260318010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create monitoring_oid table for SNMP OID monitoring per device model';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS monitoring_oid (
            id SERIAL PRIMARY KEY,
            device_model_id INT NOT NULL,
            category VARCHAR(50) NOT NULL,
            oid VARCHAR(255) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_monitoring_oid_device_model FOREIGN KEY (device_model_id) REFERENCES device_model(id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_monitoring_oid_device_model ON monitoring_oid (device_model_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS monitoring_oid');
    }
}

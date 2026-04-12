<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260412100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add CVE vulnerability tracking: cve and cve_device_model tables, vulnerability fields on context and node';
    }

    public function up(Schema $schema): void
    {
        // CVE table
        $this->addSql('CREATE TABLE IF NOT EXISTS cve (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL REFERENCES context(id) ON DELETE CASCADE,
            cve_id VARCHAR(20) NOT NULL,
            description TEXT DEFAULT NULL,
            cvss_score DOUBLE PRECISION DEFAULT NULL,
            cvss_vector VARCHAR(255) DEFAULT NULL,
            severity VARCHAR(10) NOT NULL DEFAULT \'none\',
            published_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            modified_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            synced_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uniq_cve_context UNIQUE (context_id, cve_id)
        )');
        $this->addSql('CREATE INDEX idx_cve_context ON cve (context_id)');
        $this->addSql('CREATE INDEX idx_cve_severity ON cve (severity)');
        $this->addSql('CREATE INDEX idx_cve_cvss_score ON cve (cvss_score)');

        // CVE <-> DeviceModel join table
        $this->addSql('CREATE TABLE IF NOT EXISTS cve_device_model (
            id SERIAL PRIMARY KEY,
            cve_id INT NOT NULL REFERENCES cve(id) ON DELETE CASCADE,
            device_model_id INT NOT NULL REFERENCES device_model(id) ON DELETE CASCADE,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uniq_cve_device_model UNIQUE (cve_id, device_model_id)
        )');
        $this->addSql('CREATE INDEX idx_cve_device_model_model ON cve_device_model (device_model_id)');

        // Context: vulnerability configuration fields
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS vulnerability_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS nvd_api_key VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS vulnerability_sync_interval_hours INT NOT NULL DEFAULT 24');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS vulnerability_score_weight DOUBLE PRECISION NOT NULL DEFAULT 0.3');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS compliance_score_weight DOUBLE PRECISION NOT NULL DEFAULT 0.7');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS last_vulnerability_sync_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS last_vulnerability_sync_status VARCHAR(20) DEFAULT NULL');

        // Node: sub-score fields
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS compliance_score VARCHAR(1) DEFAULT NULL');
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS vulnerability_score VARCHAR(1) DEFAULT NULL');

        // DeviceModel: NVD keyword for CVE search
        $this->addSql('ALTER TABLE device_model ADD COLUMN IF NOT EXISTS nvd_keyword VARCHAR(255) DEFAULT NULL');

        // CVE: version range fields
        $this->addSql('ALTER TABLE cve ADD COLUMN IF NOT EXISTS version_start_including VARCHAR(50) DEFAULT NULL');
        $this->addSql('ALTER TABLE cve ADD COLUMN IF NOT EXISTS version_end_excluding VARCHAR(50) DEFAULT NULL');
        $this->addSql('ALTER TABLE cve ADD COLUMN IF NOT EXISTS version_end_including VARCHAR(50) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS cve_device_model');
        $this->addSql('DROP TABLE IF EXISTS cve');

        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS vulnerability_enabled');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS nvd_api_key');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS vulnerability_sync_interval_hours');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS vulnerability_score_weight');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS compliance_score_weight');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS last_vulnerability_sync_at');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS last_vulnerability_sync_status');

        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS compliance_score');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS vulnerability_score');
        $this->addSql('ALTER TABLE device_model DROP COLUMN IF EXISTS nvd_keyword');
    }
}

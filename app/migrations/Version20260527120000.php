<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260527120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create installed_plugin table for uploadable Vendor Plugins (Phase 2).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS installed_plugin (
                id SERIAL PRIMARY KEY,
                identifier VARCHAR(128) NOT NULL,
                version VARCHAR(32) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                author VARCHAR(255) DEFAULT NULL,
                homepage TEXT DEFAULT NULL,
                license VARCHAR(64) DEFAULT NULL,
                manifest JSON NOT NULL,
                archive_path VARCHAR(512) NOT NULL,
                sha256 VARCHAR(64) NOT NULL,
                signature_status VARCHAR(32) NOT NULL DEFAULT 'community',
                signature_key_id VARCHAR(128) DEFAULT NULL,
                installed_by_id INTEGER DEFAULT NULL,
                installed_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT uniq_installed_plugin_identifier UNIQUE (identifier),
                CONSTRAINT fk_installed_plugin_user FOREIGN KEY (installed_by_id) REFERENCES "user" (id) ON DELETE SET NULL
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_installed_plugin_signature ON installed_plugin (signature_status)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS installed_plugin');
    }
}

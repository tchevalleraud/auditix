<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260503110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add syslog_server and audit_log tables for centralized log forwarding and audit viewer';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE syslog_server (
                id SERIAL NOT NULL,
                name VARCHAR(100) NOT NULL,
                host VARCHAR(255) NOT NULL,
                port INT NOT NULL DEFAULT 514,
                protocol VARCHAR(8) NOT NULL DEFAULT 'udp',
                min_level VARCHAR(16) NOT NULL DEFAULT 'info',
                facility INT NOT NULL DEFAULT 16,
                app_name VARCHAR(100) NOT NULL DEFAULT 'auditix',
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);

        $this->addSql(<<<'SQL'
            CREATE TABLE audit_log (
                id BIGSERIAL NOT NULL,
                logged_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                level VARCHAR(16) NOT NULL,
                category VARCHAR(16) NOT NULL,
                action VARCHAR(100) NOT NULL,
                actor VARCHAR(255) DEFAULT NULL,
                source_ip VARCHAR(64) DEFAULT NULL,
                message TEXT NOT NULL,
                context JSON DEFAULT NULL,
                PRIMARY KEY(id)
            )
        SQL);

        $this->addSql('CREATE INDEX idx_audit_log_logged_at ON audit_log (logged_at)');
        $this->addSql('CREATE INDEX idx_audit_log_category ON audit_log (category)');
        $this->addSql('CREATE INDEX idx_audit_log_level ON audit_log (level)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS audit_log');
        $this->addSql('DROP TABLE IF EXISTS syslog_server');
    }
}

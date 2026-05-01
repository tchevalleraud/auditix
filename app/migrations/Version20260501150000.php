<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add mail_server table for SMTP configuration';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE mail_server (
                id SERIAL NOT NULL,
                name VARCHAR(100) NOT NULL,
                host VARCHAR(255) NOT NULL,
                port INT NOT NULL,
                encryption VARCHAR(10) NOT NULL DEFAULT 'tls',
                username VARCHAR(255) DEFAULT NULL,
                password_encrypted TEXT DEFAULT NULL,
                from_email VARCHAR(255) NOT NULL,
                from_name VARCHAR(100) DEFAULT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS mail_server');
    }
}

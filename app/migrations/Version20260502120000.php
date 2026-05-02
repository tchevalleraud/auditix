<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260502120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'NGINX server management: singleton config table for HTTP/HTTPS mode and SSL certificates';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
CREATE TABLE nginx_config (
    id INT NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'http',
    server_name VARCHAR(255) NOT NULL DEFAULT 'localhost',
    certificate_encrypted TEXT DEFAULT NULL,
    private_key_encrypted TEXT DEFAULT NULL,
    certificate_chain_encrypted TEXT DEFAULT NULL,
    certificate_info JSON DEFAULT NULL,
    applied_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
)
SQL);

        $this->addSql("INSERT INTO nginx_config (id, mode, server_name) VALUES (1, 'http', 'localhost')");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS nginx_config');
    }
}

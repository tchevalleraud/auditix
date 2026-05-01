<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add auth_settings: password policy and global idle timeout';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE auth_settings (
                id INT NOT NULL,
                password_min_length INT NOT NULL DEFAULT 8,
                password_max_length INT NOT NULL DEFAULT 128,
                password_require_uppercase BOOLEAN NOT NULL DEFAULT FALSE,
                password_require_lowercase BOOLEAN NOT NULL DEFAULT FALSE,
                password_require_digit BOOLEAN NOT NULL DEFAULT FALSE,
                password_require_symbol BOOLEAN NOT NULL DEFAULT FALSE,
                idle_timeout_seconds INT NOT NULL DEFAULT 300,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);
        $this->addSql('INSERT INTO auth_settings (id) VALUES (1)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS auth_settings');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260411100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create user_dashboard table for per-user per-context widget layout';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS user_dashboard (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            context_id INT NOT NULL REFERENCES context(id) ON DELETE CASCADE,
            widgets JSON NOT NULL DEFAULT \'[]\',
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uniq_user_context UNIQUE (user_id, context_id)
        )');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS user_dashboard');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260404020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add cleanup_enabled column to schedule table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE schedule ADD COLUMN IF NOT EXISTS cleanup_enabled BOOLEAN NOT NULL DEFAULT FALSE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE schedule DROP COLUMN cleanup_enabled');
    }
}

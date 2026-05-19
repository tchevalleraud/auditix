<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260510110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add schedule.enforce_enabled column to drive the new on-demand Enforce phase.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE schedule ADD COLUMN IF NOT EXISTS enforce_enabled BOOLEAN NOT NULL DEFAULT FALSE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE schedule DROP COLUMN IF EXISTS enforce_enabled');
    }
}

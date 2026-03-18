<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260318005000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add monitoring_enabled column to context table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT false');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS monitoring_enabled');
    }
}

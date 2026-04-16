<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260414200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add is_manual boolean column to topology_link';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_link ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_link DROP COLUMN IF EXISTS is_manual');
    }
}

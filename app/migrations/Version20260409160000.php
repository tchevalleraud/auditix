<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add design_config JSON column to topology_map for visual customization';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_map ADD COLUMN IF NOT EXISTS design_config JSON NOT NULL DEFAULT '{}'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_map DROP COLUMN IF EXISTS design_config");
    }
}

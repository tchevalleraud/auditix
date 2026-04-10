<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add link_rules JSON column to topology_map for inventory-based link generation';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_map ADD COLUMN IF NOT EXISTS link_rules JSON NOT NULL DEFAULT '[]'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_map DROP COLUMN IF EXISTS link_rules");
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add style_override JSON to topology_device and topology_link for per-element custom styles';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_device ADD COLUMN IF NOT EXISTS style_override JSON DEFAULT NULL");
        $this->addSql("ALTER TABLE topology_link ADD COLUMN IF NOT EXISTS style_override JSON DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE topology_device DROP COLUMN IF EXISTS style_override");
        $this->addSql("ALTER TABLE topology_link DROP COLUMN IF EXISTS style_override");
    }
}

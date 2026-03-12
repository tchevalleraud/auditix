<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260312020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace type column with locale column in report table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'fr'");
        $this->addSql('ALTER TABLE report DROP COLUMN IF EXISTS type');
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'word'");
        $this->addSql('ALTER TABLE report DROP COLUMN IF EXISTS locale');
    }
}

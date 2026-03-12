<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260312010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add authors and revisions JSON columns to report table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report ADD COLUMN IF NOT EXISTS authors JSON NOT NULL DEFAULT '[]'");
        $this->addSql("ALTER TABLE report ADD COLUMN IF NOT EXISTS recipients JSON NOT NULL DEFAULT '[]'");
        $this->addSql("ALTER TABLE report ADD COLUMN IF NOT EXISTS revisions JSON NOT NULL DEFAULT '[]'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE report DROP COLUMN IF EXISTS authors');
        $this->addSql('ALTER TABLE report DROP COLUMN IF EXISTS recipients');
        $this->addSql('ALTER TABLE report DROP COLUMN IF EXISTS revisions');
    }
}

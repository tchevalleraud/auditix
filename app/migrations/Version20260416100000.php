<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260416100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add match_rules JSON column to compliance_policy';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_policy ADD COLUMN IF NOT EXISTS match_rules JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_policy DROP COLUMN IF EXISTS match_rules');
    }
}

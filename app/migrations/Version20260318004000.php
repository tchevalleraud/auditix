<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260318004000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add missing columns to node table: hostname, discoveredModel, discoveredVersion, score, policy, complianceEvaluating';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS hostname VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS discovered_model VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS discovered_version VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS score VARCHAR(1) DEFAULT NULL');
        $this->addSql("ALTER TABLE node ADD COLUMN IF NOT EXISTS policy VARCHAR(10) NOT NULL DEFAULT 'audit'");
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS compliance_evaluating VARCHAR(10) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS hostname');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS discovered_model');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS discovered_version');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS score');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS policy');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS compliance_evaluating');
    }
}

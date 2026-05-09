<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260509110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add recommendation_type column to compliance_rule and compliance_result. Note: the compliance_rule column is dropped by Version20260509120000 — recommendation_type lives per result branch in the conditionTree JSON, snapshotted on compliance_result.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS recommendation_type VARCHAR(10) NOT NULL DEFAULT 'text'");
        $this->addSql("ALTER TABLE compliance_result ADD COLUMN IF NOT EXISTS recommendation_type VARCHAR(10) DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS recommendation_type');
        $this->addSql('ALTER TABLE compliance_result DROP COLUMN IF EXISTS recommendation_type');
    }
}

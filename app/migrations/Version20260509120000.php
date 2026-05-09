<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260509120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Drop compliance_rule.recommendation_type — recommendation type is set per result branch in the conditionTree JSON and snapshotted on compliance_result.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN IF EXISTS recommendation_type');
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS recommendation_type VARCHAR(10) NOT NULL DEFAULT 'text'");
    }
}

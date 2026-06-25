<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add the optional per-key iteration config on compliance rules, letting a rule
 * loop over every key of an inventory category without configuring a data source.
 */
final class Version20260625120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add iteration column on compliance_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule ADD iteration JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP iteration');
    }
}

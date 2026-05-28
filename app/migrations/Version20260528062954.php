<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Adds the managed_by_plugin marker to the entity types that can be provided by
 * a vendor plugin but did not yet carry an origin column (compliance, reports).
 */
final class Version20260528062954 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add managed_by_plugin to compliance_policy, compliance_rule, report, report_schema, report_theme, mail_report';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_policy ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
        $this->addSql('ALTER TABLE report ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
        $this->addSql('ALTER TABLE report_schema ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
        $this->addSql('ALTER TABLE report_theme ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
        $this->addSql('ALTER TABLE mail_report ADD managed_by_plugin VARCHAR(128) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_policy DROP managed_by_plugin');
        $this->addSql('ALTER TABLE compliance_rule DROP managed_by_plugin');
        $this->addSql('ALTER TABLE report DROP managed_by_plugin');
        $this->addSql('ALTER TABLE report_schema DROP managed_by_plugin');
        $this->addSql('ALTER TABLE report_theme DROP managed_by_plugin');
        $this->addSql('ALTER TABLE mail_report DROP managed_by_plugin');
    }
}

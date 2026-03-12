<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308183000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add data source fields to compliance_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT \'none\'');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_category_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_key VARCHAR(500) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_value VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_command VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_tag VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_regex VARCHAR(1000) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_result_mode VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_value_map JSON DEFAULT NULL');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_source_category ON compliance_rule (source_category_id)');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule ADD CONSTRAINT FK_compliance_rule_source_category FOREIGN KEY (source_category_id) REFERENCES inventory_category (id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP CONSTRAINT FK_compliance_rule_source_category');
        $this->addSql('DROP INDEX IDX_compliance_rule_source_category');
        $this->addSql('ALTER TABLE compliance_rule DROP source_type, DROP source_category_id, DROP source_key, DROP source_value, DROP source_command, DROP source_tag, DROP source_regex, DROP source_result_mode, DROP source_value_map');
    }
}

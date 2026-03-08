<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308230000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create compliance_policy_extra_rules join table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE compliance_policy_extra_rules (compliance_policy_id INT NOT NULL, compliance_rule_id INT NOT NULL, PRIMARY KEY(compliance_policy_id, compliance_rule_id))');
        $this->addSql('CREATE INDEX IDX_policy_extra ON compliance_policy_extra_rules (compliance_policy_id)');
        $this->addSql('CREATE INDEX IDX_rule_extra ON compliance_policy_extra_rules (compliance_rule_id)');
        $this->addSql('ALTER TABLE compliance_policy_extra_rules ADD CONSTRAINT FK_policy_extra FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE compliance_policy_extra_rules ADD CONSTRAINT FK_rule_extra FOREIGN KEY (compliance_rule_id) REFERENCES compliance_rule (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE compliance_policy_extra_rules');
    }
}

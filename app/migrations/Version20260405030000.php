<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260405030000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create lab table with policies join table, drop context_public_policy';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE lab (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )');
        $this->addSql('CREATE INDEX IDX_lab_context ON lab (context_id)');
        $this->addSql('ALTER TABLE lab ADD CONSTRAINT FK_lab_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE');

        $this->addSql('CREATE TABLE lab_compliance_policy (
            lab_id INT NOT NULL,
            compliance_policy_id INT NOT NULL,
            PRIMARY KEY (lab_id, compliance_policy_id)
        )');
        $this->addSql('CREATE INDEX IDX_lab_cp_lab ON lab_compliance_policy (lab_id)');
        $this->addSql('CREATE INDEX IDX_lab_cp_policy ON lab_compliance_policy (compliance_policy_id)');
        $this->addSql('ALTER TABLE lab_compliance_policy ADD CONSTRAINT FK_lab_cp_lab FOREIGN KEY (lab_id) REFERENCES lab (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE lab_compliance_policy ADD CONSTRAINT FK_lab_cp_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE');

        $this->addSql('DROP TABLE IF EXISTS context_public_policy');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE lab_compliance_policy');
        $this->addSql('DROP TABLE lab');
    }
}

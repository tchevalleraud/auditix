<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308180000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create compliance_policy table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE compliance_policy (id SERIAL PRIMARY KEY, context_id INT NOT NULL, name VARCHAR(255) NOT NULL, description TEXT DEFAULT NULL, enabled BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL)');
        $this->addSql('CREATE INDEX IDX_compliance_policy_context ON compliance_policy (context_id)');
        $this->addSql('ALTER TABLE compliance_policy ADD CONSTRAINT FK_compliance_policy_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE');
        $this->addSql("COMMENT ON COLUMN compliance_policy.created_at IS '(DC2Type:datetime_immutable)'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE compliance_policy');
    }
}

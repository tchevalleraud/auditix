<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308181000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create compliance_rule_folder and compliance_rule tables';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS compliance_rule_folder (id SERIAL PRIMARY KEY, context_id INT NOT NULL, parent_id INT DEFAULT NULL, policy_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_folder_context ON compliance_rule_folder (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_folder_parent ON compliance_rule_folder (parent_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_folder_policy ON compliance_rule_folder (policy_id)');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule_folder ADD CONSTRAINT FK_compliance_rule_folder_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule_folder ADD CONSTRAINT FK_compliance_rule_folder_parent FOREIGN KEY (parent_id) REFERENCES compliance_rule_folder (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule_folder ADD CONSTRAINT FK_compliance_rule_folder_policy FOREIGN KEY (policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql("COMMENT ON COLUMN compliance_rule_folder.created_at IS '(DC2Type:datetime_immutable)'");

        $this->addSql('CREATE TABLE IF NOT EXISTS compliance_rule (id SERIAL PRIMARY KEY, context_id INT NOT NULL, folder_id INT DEFAULT NULL, name VARCHAR(255) NOT NULL, description TEXT DEFAULT NULL, enabled BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_context ON compliance_rule (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_compliance_rule_folder ON compliance_rule (folder_id)');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule ADD CONSTRAINT FK_compliance_rule_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_rule ADD CONSTRAINT FK_compliance_rule_folder FOREIGN KEY (folder_id) REFERENCES compliance_rule_folder (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql("COMMENT ON COLUMN compliance_rule.created_at IS '(DC2Type:datetime_immutable)'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE compliance_rule');
        $this->addSql('DROP TABLE compliance_rule_folder');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260309000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create compliance_policy_nodes join table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS compliance_policy_nodes (compliance_policy_id INT NOT NULL, node_id INT NOT NULL, PRIMARY KEY(compliance_policy_id, node_id))');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_policy_node_policy ON compliance_policy_nodes (compliance_policy_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_policy_node_node ON compliance_policy_nodes (node_id)');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_policy_nodes ADD CONSTRAINT FK_policy_node_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
        $this->addSql('DO $$ BEGIN ALTER TABLE compliance_policy_nodes ADD CONSTRAINT FK_policy_node_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE compliance_policy_nodes');
    }
}

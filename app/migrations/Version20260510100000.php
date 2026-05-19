<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260510100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add enforce_result table and node.enforcing column for the on-demand Enforce worker.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE node ADD COLUMN IF NOT EXISTS enforcing VARCHAR(10) DEFAULT NULL");

        $this->addSql("CREATE TABLE IF NOT EXISTS enforce_result (
            id SERIAL PRIMARY KEY,
            node_id INT NOT NULL,
            policy_id INT DEFAULT NULL,
            rule_id INT DEFAULT NULL,
            command TEXT NOT NULL,
            output TEXT DEFAULT NULL,
            status VARCHAR(20) NOT NULL,
            attempts INT NOT NULL DEFAULT 1,
            error TEXT DEFAULT NULL,
            executed_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_enforce_result_node FOREIGN KEY (node_id) REFERENCES node(id) ON DELETE CASCADE,
            CONSTRAINT fk_enforce_result_policy FOREIGN KEY (policy_id) REFERENCES compliance_policy(id) ON DELETE SET NULL,
            CONSTRAINT fk_enforce_result_rule FOREIGN KEY (rule_id) REFERENCES compliance_rule(id) ON DELETE SET NULL
        )");
        $this->addSql("CREATE INDEX IF NOT EXISTS idx_enforce_result_node ON enforce_result(node_id)");
        $this->addSql("CREATE INDEX IF NOT EXISTS idx_enforce_result_executed_at ON enforce_result(executed_at)");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS enforce_result');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS enforcing');
    }
}

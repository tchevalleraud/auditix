<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260309010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create compliance_result table for storing compliance evaluation results';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE compliance_result (
            id SERIAL PRIMARY KEY,
            policy_id INT NOT NULL,
            rule_id INT NOT NULL,
            node_id INT NOT NULL,
            status VARCHAR(20) NOT NULL,
            severity VARCHAR(10) DEFAULT NULL,
            message TEXT DEFAULT NULL,
            evaluated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_compliance_result_policy FOREIGN KEY (policy_id) REFERENCES compliance_policy(id) ON DELETE CASCADE,
            CONSTRAINT fk_compliance_result_rule FOREIGN KEY (rule_id) REFERENCES compliance_rule(id) ON DELETE CASCADE,
            CONSTRAINT fk_compliance_result_node FOREIGN KEY (node_id) REFERENCES node(id) ON DELETE CASCADE
        )');

        $this->addSql('CREATE INDEX idx_result_policy_node ON compliance_result (policy_id, node_id)');
        $this->addSql('CREATE INDEX idx_result_node ON compliance_result (node_id)');
        $this->addSql('CREATE UNIQUE INDEX uniq_result_policy_rule_node ON compliance_result (policy_id, rule_id, node_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE compliance_result');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260405040000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create lab_task table, migrate policies from lab to lab_task, drop lab_compliance_policy';
    }

    public function up(Schema $schema): void
    {
        // 1. Create lab_task table
        $this->addSql('CREATE TABLE IF NOT EXISTS lab_task (
            id SERIAL PRIMARY KEY,
            lab_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            position INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_lab_task_lab ON lab_task (lab_id)');
        $this->addSql("DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_lab_task_lab') THEN
                ALTER TABLE lab_task ADD CONSTRAINT FK_lab_task_lab FOREIGN KEY (lab_id) REFERENCES lab (id) ON DELETE CASCADE;
            END IF;
        END $$;");

        // 2. Create lab_task_compliance_policy join table
        $this->addSql('CREATE TABLE IF NOT EXISTS lab_task_compliance_policy (
            lab_task_id INT NOT NULL,
            compliance_policy_id INT NOT NULL,
            PRIMARY KEY (lab_task_id, compliance_policy_id)
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_ltcp_task ON lab_task_compliance_policy (lab_task_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_ltcp_policy ON lab_task_compliance_policy (compliance_policy_id)');
        $this->addSql("DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ltcp_task') THEN
                ALTER TABLE lab_task_compliance_policy ADD CONSTRAINT FK_ltcp_task FOREIGN KEY (lab_task_id) REFERENCES lab_task (id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ltcp_policy') THEN
                ALTER TABLE lab_task_compliance_policy ADD CONSTRAINT FK_ltcp_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE;
            END IF;
        END $$;");

        // 3. Migrate existing data: create a default task per lab and move policies (only if old table still exists)
        $this->addSql("DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_compliance_policy') THEN
                INSERT INTO lab_task (lab_id, name, position, created_at)
                    SELECT DISTINCT lcp.lab_id, l.name, 0, NOW()
                    FROM lab_compliance_policy lcp
                    JOIN lab l ON l.id = lcp.lab_id;
                INSERT INTO lab_task_compliance_policy (lab_task_id, compliance_policy_id)
                    SELECT lt.id, lcp.compliance_policy_id
                    FROM lab_compliance_policy lcp
                    JOIN lab_task lt ON lt.lab_id = lcp.lab_id
                    ON CONFLICT DO NOTHING;
            END IF;
        END $$;");

        // 4. Drop old join table
        $this->addSql('DROP TABLE IF EXISTS lab_compliance_policy');
    }

    public function down(Schema $schema): void
    {
        // Recreate lab_compliance_policy
        $this->addSql('CREATE TABLE lab_compliance_policy (
            lab_id INT NOT NULL,
            compliance_policy_id INT NOT NULL,
            PRIMARY KEY (lab_id, compliance_policy_id)
        )');
        $this->addSql('CREATE INDEX IDX_lab_cp_lab ON lab_compliance_policy (lab_id)');
        $this->addSql('CREATE INDEX IDX_lab_cp_policy ON lab_compliance_policy (compliance_policy_id)');
        $this->addSql('ALTER TABLE lab_compliance_policy ADD CONSTRAINT FK_lab_cp_lab FOREIGN KEY (lab_id) REFERENCES lab (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE lab_compliance_policy ADD CONSTRAINT FK_lab_cp_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE');

        // Migrate data back
        $this->addSql("
            INSERT INTO lab_compliance_policy (lab_id, compliance_policy_id)
            SELECT lt.lab_id, ltcp.compliance_policy_id
            FROM lab_task_compliance_policy ltcp
            JOIN lab_task lt ON lt.id = ltcp.lab_task_id
        ");

        $this->addSql('DROP TABLE lab_task_compliance_policy');
        $this->addSql('DROP TABLE lab_task');
    }
}

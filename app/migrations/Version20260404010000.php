<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260404010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create schedule table for automated task scheduling';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE IF NOT EXISTS schedule (
            id SERIAL PRIMARY KEY,
            context_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            cron_expression VARCHAR(255) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            current_phase VARCHAR(20) DEFAULT NULL,
            current_phase_status VARCHAR(20) DEFAULT NULL,
            last_triggered_at TIMESTAMP DEFAULT NULL,
            last_completed_at TIMESTAMP DEFAULT NULL,
            next_run_at TIMESTAMP DEFAULT NULL,
            collection_node_ids JSON DEFAULT NULL,
            compliance_node_ids JSON DEFAULT NULL,
            report_ids JSON DEFAULT NULL,
            collection_ids JSON DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NULL
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_schedule_context ON schedule (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_schedule_next_run ON schedule (next_run_at)');
        $this->addSql("DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_schedule_context') THEN
                ALTER TABLE schedule ADD CONSTRAINT FK_schedule_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE;
            END IF;
        END $$;");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE schedule');
    }
}

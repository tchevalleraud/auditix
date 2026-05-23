<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace per-context AI config with first-class AiAssistant entity (multiple assistants per context). Wire conversations to the assistant.';
    }

    public function up(Schema $schema): void
    {
        // 1) Create the new ai_assistant table.
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS ai_assistant (
                id SERIAL PRIMARY KEY,
                context_id INTEGER NOT NULL,
                provider_id INTEGER NOT NULL,
                name VARCHAR(100) NOT NULL,
                model VARCHAR(255) NULL,
                system_prompt TEXT NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_ai_assistant_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE,
                CONSTRAINT fk_ai_assistant_provider FOREIGN KEY (provider_id) REFERENCES llm_provider(id) ON DELETE RESTRICT
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_ai_assistant_context ON ai_assistant (context_id)');

        // 2) Backfill: any context that already had AI enabled becomes a "Default" assistant.
        //    Only run when the old columns exist, otherwise the SELECT errors out.
        $hasOldCol = $this->connection->fetchOne(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'context' AND column_name = 'ai_provider_id'"
        );
        if ($hasOldCol) {
            $this->addSql(<<<'SQL'
                INSERT INTO ai_assistant (context_id, provider_id, name, model, system_prompt, enabled, created_at, updated_at)
                SELECT id, ai_provider_id, 'Default', ai_model, ai_system_prompt, ai_assistant_enabled, NOW(), NOW()
                FROM context
                WHERE ai_provider_id IS NOT NULL
            SQL);
        }

        // 3) Drop the per-context AI columns.
        $this->addSql('ALTER TABLE context DROP CONSTRAINT IF EXISTS fk_context_ai_provider');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_system_prompt');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_model');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_provider_id');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_assistant_enabled');

        // 4) Rewire ai_conversation to point at an assistant instead of a context.
        //    We add the new column, backfill from the context's first assistant
        //    (best effort), then drop the old column. Existing conversations
        //    without a matching assistant are removed — they're a small dev
        //    artefact and cannot be addressed without the old binding.
        $this->addSql('ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS assistant_id INTEGER NULL');
        $this->addSql(<<<'SQL'
            UPDATE ai_conversation c
            SET assistant_id = (
                SELECT a.id FROM ai_assistant a WHERE a.context_id = c.context_id ORDER BY a.id LIMIT 1
            )
            WHERE assistant_id IS NULL
        SQL);
        $this->addSql('DELETE FROM ai_conversation WHERE assistant_id IS NULL');
        $this->addSql('ALTER TABLE ai_conversation ALTER COLUMN assistant_id SET NOT NULL');
        $this->addSql(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_ai_conv_assistant' AND table_name = 'ai_conversation'
                ) THEN
                    ALTER TABLE ai_conversation
                        ADD CONSTRAINT fk_ai_conv_assistant
                        FOREIGN KEY (assistant_id) REFERENCES ai_assistant(id) ON DELETE CASCADE;
                END IF;
            END$$;
        SQL);
        $this->addSql('DROP INDEX IF EXISTS idx_ai_conv_user_context');
        $this->addSql('ALTER TABLE ai_conversation DROP CONSTRAINT IF EXISTS fk_ai_conv_context');
        $this->addSql('ALTER TABLE ai_conversation DROP COLUMN IF EXISTS context_id');
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_ai_conv_user_assistant ON ai_conversation (user_id, assistant_id)');
    }

    public function down(Schema $schema): void
    {
        // Reverse path is best-effort: re-introduce the context columns and
        // pick the first assistant per context to backfill them.
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_provider_id INTEGER NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_model VARCHAR(255) NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT NULL');
        $this->addSql('ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS context_id INTEGER NULL');
        $this->addSql(<<<'SQL'
            UPDATE ai_conversation c
            SET context_id = (SELECT a.context_id FROM ai_assistant a WHERE a.id = c.assistant_id)
            WHERE context_id IS NULL
        SQL);
        $this->addSql('DROP INDEX IF EXISTS idx_ai_conv_user_assistant');
        $this->addSql('ALTER TABLE ai_conversation DROP CONSTRAINT IF EXISTS fk_ai_conv_assistant');
        $this->addSql('ALTER TABLE ai_conversation DROP COLUMN IF EXISTS assistant_id');
        $this->addSql('DROP TABLE IF EXISTS ai_assistant');
    }
}

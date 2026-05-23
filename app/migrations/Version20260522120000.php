<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add AI assistant: llm_provider table, context AI fields, ai_conversation + ai_message tables.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS llm_provider (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(32) NOT NULL,
                base_url VARCHAR(512) NOT NULL,
                api_key_encrypted TEXT NULL,
                default_model VARCHAR(255) NULL,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL
            )
        SQL);

        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_provider_id INTEGER NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_model VARCHAR(255) NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT NULL');
        $this->addSql(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'fk_context_ai_provider' AND table_name = 'context'
                ) THEN
                    ALTER TABLE context
                        ADD CONSTRAINT fk_context_ai_provider
                        FOREIGN KEY (ai_provider_id) REFERENCES llm_provider(id) ON DELETE SET NULL;
                END IF;
            END$$;
        SQL);

        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS ai_conversation (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                context_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_ai_conv_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
                CONSTRAINT fk_ai_conv_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_ai_conv_user_context ON ai_conversation (user_id, context_id)');

        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS ai_message (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                role VARCHAR(16) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_ai_msg_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversation(id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_ai_msg_conversation ON ai_message (conversation_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS ai_message');
        $this->addSql('DROP TABLE IF EXISTS ai_conversation');
        $this->addSql('ALTER TABLE context DROP CONSTRAINT IF EXISTS fk_context_ai_provider');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_system_prompt');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_model');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_provider_id');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS ai_assistant_enabled');
        $this->addSql('DROP TABLE IF EXISTS llm_provider');
    }
}

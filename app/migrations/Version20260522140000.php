<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'AI tools: assistant.tools_enabled, conversation.alias_map (per-conversation anonymisation map), message.metadata (tool call payloads).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_assistant ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS alias_map JSON NULL');
        $this->addSql('ALTER TABLE ai_message ADD COLUMN IF NOT EXISTS metadata JSON NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_message DROP COLUMN IF EXISTS metadata');
        $this->addSql('ALTER TABLE ai_conversation DROP COLUMN IF EXISTS alias_map');
        $this->addSql('ALTER TABLE ai_assistant DROP COLUMN IF EXISTS tools_enabled');
    }
}

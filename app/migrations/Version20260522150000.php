<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522150000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Human-in-the-loop: ai_conversation.auto_approve_tools — when false (default), the tool-calling loop pauses after each tool_call to ask the user before sending data to the LLM.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS auto_approve_tools BOOLEAN NOT NULL DEFAULT FALSE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_conversation DROP COLUMN IF EXISTS auto_approve_tools');
    }
}

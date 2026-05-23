<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Drop ai_conversation.alias_map — anonymisation removed in favour of the human-in-the-loop approval gate.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_conversation DROP COLUMN IF EXISTS alias_map');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE ai_conversation ADD COLUMN IF NOT EXISTS alias_map JSON NULL');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260522110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add context.feedback_button_enabled (default TRUE) to toggle the floating "Suggest a feature" link per context.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS feedback_button_enabled BOOLEAN NOT NULL DEFAULT TRUE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS feedback_button_enabled');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501170000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add addressing_mode column to mail_server (to/bcc/mail_merge)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE mail_server ADD COLUMN addressing_mode VARCHAR(20) NOT NULL DEFAULT 'to'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE mail_server DROP COLUMN IF EXISTS addressing_mode');
    }
}

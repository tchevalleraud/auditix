<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260414100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add translations JSON column to collection_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule ADD COLUMN IF NOT EXISTS translations JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule DROP COLUMN IF EXISTS translations');
    }
}

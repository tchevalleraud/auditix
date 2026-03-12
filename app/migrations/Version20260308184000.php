<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308184000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add source_key_group column to compliance_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule ADD COLUMN IF NOT EXISTS source_key_group INT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP source_key_group');
    }
}

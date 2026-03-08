<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308220000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add multi_row_messages column to compliance_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule ADD multi_row_messages JSONB DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP multi_row_messages');
    }
}

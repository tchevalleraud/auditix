<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308182000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add identifier column to compliance_rule';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule ADD identifier VARCHAR(100) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_rule DROP COLUMN identifier');
    }
}

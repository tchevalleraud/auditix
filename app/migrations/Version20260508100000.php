<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260508100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add message_long and recommendation columns to compliance_result for rich result descriptions';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_result ADD COLUMN IF NOT EXISTS message_long TEXT DEFAULT NULL');
        $this->addSql('ALTER TABLE compliance_result ADD COLUMN IF NOT EXISTS recommendation TEXT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE compliance_result DROP COLUMN IF EXISTS message_long');
        $this->addSql('ALTER TABLE compliance_result DROP COLUMN IF EXISTS recommendation');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260311030000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add report generation fields';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE report ADD COLUMN IF NOT EXISTS generating_status VARCHAR(20) DEFAULT NULL');
        $this->addSql('ALTER TABLE report ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql('ALTER TABLE report ADD COLUMN IF NOT EXISTS generated_file VARCHAR(500) DEFAULT NULL');
        $this->addSql("COMMENT ON COLUMN report.generated_at IS '(DC2Type:datetime_immutable)'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE report DROP COLUMN generating_status');
        $this->addSql('ALTER TABLE report DROP COLUMN generated_at');
        $this->addSql('ALTER TABLE report DROP COLUMN generated_file');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260428200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add TOTP (2FA) columns on user';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64) DEFAULT NULL');
        $this->addSql('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_backup_codes JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_confirmed_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
        $this->addSql("COMMENT ON COLUMN \"user\".totp_confirmed_at IS '(DC2Type:datetime_immutable)'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS totp_secret');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS totp_enabled');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS totp_backup_codes');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS totp_confirmed_at');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260318030000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add configurable SNMP poll interval per context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS snmp_poll_interval_seconds INT NOT NULL DEFAULT 60');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS snmp_poll_interval_seconds');
    }
}

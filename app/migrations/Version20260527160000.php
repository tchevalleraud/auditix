<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260527160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add managed_by_plugin column to editor and device_model (Phase 6 catalog plugins).';
    }

    public function up(Schema $schema): void
    {
        foreach (['editor', 'device_model'] as $table) {
            $this->addSql(sprintf('ALTER TABLE %s ADD COLUMN IF NOT EXISTS managed_by_plugin VARCHAR(128) DEFAULT NULL', $table));
            $this->addSql(sprintf('CREATE INDEX IF NOT EXISTS idx_%s_managed_by_plugin ON %s (managed_by_plugin)', $table, $table));
        }
    }

    public function down(Schema $schema): void
    {
        foreach (['editor', 'device_model'] as $table) {
            $this->addSql(sprintf('DROP INDEX IF EXISTS idx_%s_managed_by_plugin', $table));
            $this->addSql(sprintf('ALTER TABLE %s DROP COLUMN IF EXISTS managed_by_plugin', $table));
        }
    }
}

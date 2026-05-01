<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add oidc_configuration.claim_groups and default_context_id for multi-source mappings and default context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE oidc_configuration ADD COLUMN IF NOT EXISTS claim_groups VARCHAR(100) DEFAULT NULL');
        $this->addSql('ALTER TABLE oidc_configuration ADD COLUMN IF NOT EXISTS default_context_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE oidc_configuration ADD CONSTRAINT fk_oidc_default_context FOREIGN KEY (default_context_id) REFERENCES context(id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX idx_oidc_default_context ON oidc_configuration (default_context_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX IF EXISTS idx_oidc_default_context');
        $this->addSql('ALTER TABLE oidc_configuration DROP CONSTRAINT IF EXISTS fk_oidc_default_context');
        $this->addSql('ALTER TABLE oidc_configuration DROP COLUMN IF EXISTS default_context_id');
        $this->addSql('ALTER TABLE oidc_configuration DROP COLUMN IF EXISTS claim_groups');
    }
}

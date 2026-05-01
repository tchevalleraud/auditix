<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Multi-IdP support: oidc_provider table, scoped mappings, per-user provider FK';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE oidc_provider (
                id SERIAL NOT NULL,
                slug VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                discovery_url VARCHAR(500) DEFAULT NULL,
                client_id VARCHAR(255) DEFAULT NULL,
                client_secret_encrypted TEXT DEFAULT NULL,
                scopes VARCHAR(255) NOT NULL DEFAULT 'openid profile email',
                button_label VARCHAR(100) DEFAULT NULL,
                button_color VARCHAR(20) DEFAULT NULL,
                button_icon_url VARCHAR(500) DEFAULT NULL,
                claim_username VARCHAR(100) NOT NULL DEFAULT 'preferred_username',
                claim_email VARCHAR(100) NOT NULL DEFAULT 'email',
                claim_firstname VARCHAR(100) NOT NULL DEFAULT 'given_name',
                claim_lastname VARCHAR(100) NOT NULL DEFAULT 'family_name',
                claim_roles VARCHAR(100) NOT NULL DEFAULT 'realm_access.roles',
                claim_groups VARCHAR(100) DEFAULT NULL,
                required_role VARCHAR(255) DEFAULT NULL,
                auto_provisioning BOOLEAN NOT NULL DEFAULT TRUE,
                default_context_id INT DEFAULT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id),
                CONSTRAINT uniq_oidc_provider_slug UNIQUE (slug),
                CONSTRAINT fk_oidc_provider_default_context FOREIGN KEY (default_context_id) REFERENCES context(id) ON DELETE SET NULL
            )
        SQL);
        $this->addSql('CREATE INDEX idx_oidc_provider_default_context ON oidc_provider (default_context_id)');

        // Migrate existing singleton config to first provider (slug=keycloak by default)
        $this->addSql(<<<'SQL'
            INSERT INTO oidc_provider (
                slug, name, enabled, discovery_url, client_id, client_secret_encrypted, scopes,
                button_label, claim_username, claim_email, claim_firstname, claim_lastname,
                claim_roles, claim_groups, required_role, auto_provisioning, default_context_id, sort_order
            )
            SELECT 'keycloak', 'Keycloak', enabled, discovery_url, client_id, client_secret_encrypted, scopes,
                   button_label, claim_username, claim_email, claim_firstname, claim_lastname,
                   claim_roles, claim_groups, required_role, auto_provisioning, default_context_id, 0
            FROM oidc_configuration WHERE id = 1
        SQL);

        // Add provider FK on mapping tables
        $this->addSql('ALTER TABLE oidc_role_mapping ADD COLUMN provider_id INT NULL');
        $this->addSql("UPDATE oidc_role_mapping SET provider_id = (SELECT id FROM oidc_provider WHERE slug = 'keycloak')");
        $this->addSql('ALTER TABLE oidc_role_mapping ALTER COLUMN provider_id SET NOT NULL');
        $this->addSql('ALTER TABLE oidc_role_mapping ADD CONSTRAINT fk_oidc_role_mapping_provider FOREIGN KEY (provider_id) REFERENCES oidc_provider(id) ON DELETE CASCADE');
        $this->addSql('CREATE INDEX idx_oidc_role_mapping_provider ON oidc_role_mapping (provider_id)');

        $this->addSql('ALTER TABLE oidc_context_mapping ADD COLUMN provider_id INT NULL');
        $this->addSql("UPDATE oidc_context_mapping SET provider_id = (SELECT id FROM oidc_provider WHERE slug = 'keycloak')");
        $this->addSql('ALTER TABLE oidc_context_mapping ALTER COLUMN provider_id SET NOT NULL');
        $this->addSql('ALTER TABLE oidc_context_mapping ADD CONSTRAINT fk_oidc_context_mapping_provider FOREIGN KEY (provider_id) REFERENCES oidc_provider(id) ON DELETE CASCADE');
        $this->addSql('CREATE INDEX idx_oidc_context_mapping_provider ON oidc_context_mapping (provider_id)');

        // User: add provider FK, scope unique on (provider_id, oidc_subject)
        $this->addSql('ALTER TABLE "user" ADD COLUMN oidc_provider_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE "user" ADD CONSTRAINT fk_user_oidc_provider FOREIGN KEY (oidc_provider_id) REFERENCES oidc_provider(id) ON DELETE SET NULL');
        $this->addSql('CREATE INDEX idx_user_oidc_provider ON "user" (oidc_provider_id)');
        $this->addSql("UPDATE \"user\" SET oidc_provider_id = (SELECT id FROM oidc_provider WHERE slug = 'keycloak') WHERE oidc_subject IS NOT NULL");
        $this->addSql('DROP INDEX IF EXISTS uniq_user_oidc_subject');
        $this->addSql('CREATE UNIQUE INDEX uniq_user_oidc_provider_subject ON "user" (oidc_provider_id, oidc_subject) WHERE oidc_subject IS NOT NULL');

        // Drop the now-obsolete singleton
        $this->addSql('DROP TABLE oidc_configuration');
    }

    public function down(Schema $schema): void
    {
        // Recreate singleton (lossy if multiple providers existed)
        $this->addSql(<<<'SQL'
            CREATE TABLE oidc_configuration (
                id INT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                discovery_url VARCHAR(500) DEFAULT NULL,
                client_id VARCHAR(255) DEFAULT NULL,
                client_secret_encrypted TEXT DEFAULT NULL,
                scopes VARCHAR(255) NOT NULL DEFAULT 'openid profile email',
                button_label VARCHAR(100) DEFAULT NULL,
                claim_username VARCHAR(100) NOT NULL DEFAULT 'preferred_username',
                claim_email VARCHAR(100) NOT NULL DEFAULT 'email',
                claim_firstname VARCHAR(100) NOT NULL DEFAULT 'given_name',
                claim_lastname VARCHAR(100) NOT NULL DEFAULT 'family_name',
                claim_roles VARCHAR(100) NOT NULL DEFAULT 'realm_access.roles',
                claim_groups VARCHAR(100) DEFAULT NULL,
                required_role VARCHAR(255) DEFAULT NULL,
                auto_provisioning BOOLEAN NOT NULL DEFAULT TRUE,
                default_context_id INT DEFAULT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);
        $this->addSql(<<<'SQL'
            INSERT INTO oidc_configuration (id, enabled, discovery_url, client_id, client_secret_encrypted, scopes,
                button_label, claim_username, claim_email, claim_firstname, claim_lastname, claim_roles, claim_groups,
                required_role, auto_provisioning, default_context_id)
            SELECT 1, enabled, discovery_url, client_id, client_secret_encrypted, scopes,
                button_label, claim_username, claim_email, claim_firstname, claim_lastname, claim_roles, claim_groups,
                required_role, auto_provisioning, default_context_id
            FROM oidc_provider ORDER BY id LIMIT 1
        SQL);

        $this->addSql('DROP INDEX IF EXISTS uniq_user_oidc_provider_subject');
        $this->addSql('CREATE UNIQUE INDEX uniq_user_oidc_subject ON "user" (oidc_subject) WHERE oidc_subject IS NOT NULL');
        $this->addSql('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS fk_user_oidc_provider');
        $this->addSql('DROP INDEX IF EXISTS idx_user_oidc_provider');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS oidc_provider_id');

        $this->addSql('ALTER TABLE oidc_context_mapping DROP CONSTRAINT IF EXISTS fk_oidc_context_mapping_provider');
        $this->addSql('DROP INDEX IF EXISTS idx_oidc_context_mapping_provider');
        $this->addSql('ALTER TABLE oidc_context_mapping DROP COLUMN IF EXISTS provider_id');

        $this->addSql('ALTER TABLE oidc_role_mapping DROP CONSTRAINT IF EXISTS fk_oidc_role_mapping_provider');
        $this->addSql('DROP INDEX IF EXISTS idx_oidc_role_mapping_provider');
        $this->addSql('ALTER TABLE oidc_role_mapping DROP COLUMN IF EXISTS provider_id');

        $this->addSql('DROP INDEX IF EXISTS idx_oidc_provider_default_context');
        $this->addSql('DROP TABLE oidc_provider');
    }
}

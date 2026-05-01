<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add OIDC authentication: configuration, role mappings, context mappings, and user oidc_subject/oidc_provisioned fields';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE oidc_configuration (
                id INT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                discovery_url VARCHAR(500) DEFAULT NULL,
                client_id VARCHAR(255) DEFAULT NULL,
                client_secret_encrypted TEXT DEFAULT NULL,
                scopes VARCHAR(255) NOT NULL DEFAULT 'openid profile email',
                button_label VARCHAR(100) NOT NULL DEFAULT 'Se connecter avec SSO',
                claim_username VARCHAR(100) NOT NULL DEFAULT 'preferred_username',
                claim_email VARCHAR(100) NOT NULL DEFAULT 'email',
                claim_firstname VARCHAR(100) NOT NULL DEFAULT 'given_name',
                claim_lastname VARCHAR(100) NOT NULL DEFAULT 'family_name',
                claim_roles VARCHAR(100) NOT NULL DEFAULT 'realm_access.roles',
                required_role VARCHAR(255) DEFAULT NULL,
                auto_provisioning BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);

        $this->addSql("INSERT INTO oidc_configuration (id) VALUES (1)");

        $this->addSql(<<<'SQL'
            CREATE TABLE oidc_role_mapping (
                id SERIAL NOT NULL,
                claim_value VARCHAR(255) NOT NULL,
                granted_role VARCHAR(64) NOT NULL,
                priority INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id)
            )
        SQL);
        $this->addSql('CREATE INDEX idx_oidc_role_mapping_claim ON oidc_role_mapping (claim_value)');

        $this->addSql(<<<'SQL'
            CREATE TABLE oidc_context_mapping (
                id SERIAL NOT NULL,
                claim_value VARCHAR(255) NOT NULL,
                context_id INT NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(id),
                CONSTRAINT fk_oidc_context_mapping_context FOREIGN KEY (context_id) REFERENCES context(id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX idx_oidc_context_mapping_claim ON oidc_context_mapping (claim_value)');
        $this->addSql('CREATE INDEX idx_oidc_context_mapping_context ON oidc_context_mapping (context_id)');

        $this->addSql('ALTER TABLE "user" ALTER COLUMN password DROP NOT NULL');
        $this->addSql('ALTER TABLE "user" ADD COLUMN oidc_subject VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE "user" ADD COLUMN oidc_provisioned BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('CREATE UNIQUE INDEX uniq_user_oidc_subject ON "user" (oidc_subject) WHERE oidc_subject IS NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX IF EXISTS uniq_user_oidc_subject');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS oidc_provisioned');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS oidc_subject');
        $this->addSql('UPDATE "user" SET password = \'\' WHERE password IS NULL');
        $this->addSql('ALTER TABLE "user" ALTER COLUMN password SET NOT NULL');

        $this->addSql('DROP TABLE IF EXISTS oidc_context_mapping');
        $this->addSql('DROP TABLE IF EXISTS oidc_role_mapping');
        $this->addSql('DROP TABLE IF EXISTS oidc_configuration');
    }
}

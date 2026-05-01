<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260501110000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add user.oidc_claims (JSON) and make oidc_configuration.button_label nullable for i18n default';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS oidc_claims JSON DEFAULT NULL');
        $this->addSql('ALTER TABLE oidc_configuration ALTER COLUMN button_label DROP NOT NULL');
        $this->addSql('ALTER TABLE oidc_configuration ALTER COLUMN button_label DROP DEFAULT');
        $this->addSql("UPDATE oidc_configuration SET button_label = NULL WHERE button_label = 'Se connecter avec SSO'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("UPDATE oidc_configuration SET button_label = 'Se connecter avec SSO' WHERE button_label IS NULL");
        $this->addSql("ALTER TABLE oidc_configuration ALTER COLUMN button_label SET DEFAULT 'Se connecter avec SSO'");
        $this->addSql('ALTER TABLE oidc_configuration ALTER COLUMN button_label SET NOT NULL');
        $this->addSql('ALTER TABLE "user" DROP COLUMN IF EXISTS oidc_claims');
    }
}

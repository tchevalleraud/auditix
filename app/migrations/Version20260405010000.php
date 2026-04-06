<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260405010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add public lab page fields to context table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS public_enabled BOOLEAN NOT NULL DEFAULT FALSE');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS public_token VARCHAR(64) DEFAULT NULL');
        $this->addSql('ALTER TABLE context ADD COLUMN IF NOT EXISTS public_policy_id INT DEFAULT NULL');
        $this->addSql("DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_context_public_policy') THEN
                ALTER TABLE context ADD CONSTRAINT FK_context_public_policy FOREIGN KEY (public_policy_id) REFERENCES compliance_policy (id) ON DELETE SET NULL;
            END IF;
        END $$;");
        $this->addSql('CREATE UNIQUE INDEX IF NOT EXISTS UNIQ_context_public_token ON context (public_token)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN public_enabled');
        $this->addSql('ALTER TABLE context DROP COLUMN public_token');
        $this->addSql('ALTER TABLE context DROP COLUMN public_policy_id');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260405020000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace single public_policy_id with ManyToMany context_public_policy join table';
    }

    public function up(Schema $schema): void
    {
        // Create join table
        $this->addSql('CREATE TABLE IF NOT EXISTS context_public_policy (
            context_id INT NOT NULL,
            compliance_policy_id INT NOT NULL,
            PRIMARY KEY (context_id, compliance_policy_id)
        )');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_ctx_pub_pol_context ON context_public_policy (context_id)');
        $this->addSql('CREATE INDEX IF NOT EXISTS IDX_ctx_pub_pol_policy ON context_public_policy (compliance_policy_id)');
        $this->addSql("DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ctx_pub_pol_context') THEN
                ALTER TABLE context_public_policy ADD CONSTRAINT FK_ctx_pub_pol_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ctx_pub_pol_policy') THEN
                ALTER TABLE context_public_policy ADD CONSTRAINT FK_ctx_pub_pol_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE;
            END IF;
        END $$;");

        // Migrate existing data (only if old column still exists)
        $this->addSql("DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'context' AND column_name = 'public_policy_id') THEN
                INSERT INTO context_public_policy (context_id, compliance_policy_id)
                    SELECT id, public_policy_id FROM context WHERE public_policy_id IS NOT NULL
                    ON CONFLICT DO NOTHING;
            END IF;
        END $$;");

        // Drop old column
        $this->addSql('ALTER TABLE context DROP CONSTRAINT IF EXISTS FK_context_public_policy');
        $this->addSql('ALTER TABLE context DROP COLUMN IF EXISTS public_policy_id');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN public_policy_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE context ADD CONSTRAINT FK_context_public_policy FOREIGN KEY (public_policy_id) REFERENCES compliance_policy (id) ON DELETE SET NULL');
        $this->addSql('DROP TABLE context_public_policy');
    }
}

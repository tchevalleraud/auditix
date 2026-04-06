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
        $this->addSql('CREATE TABLE context_public_policy (
            context_id INT NOT NULL,
            compliance_policy_id INT NOT NULL,
            PRIMARY KEY (context_id, compliance_policy_id)
        )');
        $this->addSql('CREATE INDEX IDX_ctx_pub_pol_context ON context_public_policy (context_id)');
        $this->addSql('CREATE INDEX IDX_ctx_pub_pol_policy ON context_public_policy (compliance_policy_id)');
        $this->addSql('ALTER TABLE context_public_policy ADD CONSTRAINT FK_ctx_pub_pol_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE context_public_policy ADD CONSTRAINT FK_ctx_pub_pol_policy FOREIGN KEY (compliance_policy_id) REFERENCES compliance_policy (id) ON DELETE CASCADE');

        // Migrate existing data
        $this->addSql('INSERT INTO context_public_policy (context_id, compliance_policy_id) SELECT id, public_policy_id FROM context WHERE public_policy_id IS NOT NULL');

        // Drop old column
        $this->addSql('ALTER TABLE context DROP CONSTRAINT IF EXISTS FK_context_public_policy');
        $this->addSql('ALTER TABLE context DROP COLUMN public_policy_id');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN public_policy_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE context ADD CONSTRAINT FK_context_public_policy FOREIGN KEY (public_policy_id) REFERENCES compliance_policy (id) ON DELETE SET NULL');
        $this->addSql('DROP TABLE context_public_policy');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add ACL feature flag and inventory mapping config to context.
 */
final class Version20260531120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add acl_enabled and acl_config columns to context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            ALTER TABLE context ADD acl_enabled BOOLEAN DEFAULT false NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE context ADD acl_config JSON DEFAULT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            ALTER TABLE context DROP acl_enabled
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE context DROP acl_config
        SQL);
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add stack feature flag and inventory mapping config to context.
 */
final class Version20260708120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add stack_enabled and stack_config columns to context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            ALTER TABLE context ADD stack_enabled BOOLEAN DEFAULT false NOT NULL
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE context ADD stack_config JSON DEFAULT NULL
        SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            ALTER TABLE context DROP stack_enabled
        SQL);
        $this->addSql(<<<'SQL'
            ALTER TABLE context DROP stack_config
        SQL);
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add block extraction mode to collection_rule_extract: extract_mode, block_separator, block_key_group';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE collection_rule_extract ADD COLUMN IF NOT EXISTS extract_mode VARCHAR(10) NOT NULL DEFAULT 'line'");
        $this->addSql("ALTER TABLE collection_rule_extract ADD COLUMN IF NOT EXISTS block_separator VARCHAR(1000) DEFAULT NULL");
        $this->addSql("ALTER TABLE collection_rule_extract ADD COLUMN IF NOT EXISTS block_key_group INT DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("ALTER TABLE collection_rule_extract DROP COLUMN IF EXISTS extract_mode");
        $this->addSql("ALTER TABLE collection_rule_extract DROP COLUMN IF EXISTS block_separator");
        $this->addSql("ALTER TABLE collection_rule_extract DROP COLUMN IF EXISTS block_key_group");
    }
}

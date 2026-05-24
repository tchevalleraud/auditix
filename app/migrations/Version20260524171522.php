<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add CollectionRuleExtract.block_key_template — optional string that composes
 * the per-block entry key from multiple capture groups of blockSeparator
 * (e.g. "$1-MSTP$2" to combine Port Number + Instance Id).
 */
final class Version20260524171522 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add CollectionRuleExtract.block_key_template column';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule_extract ADD block_key_template VARCHAR(500) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule_extract DROP block_key_template');
    }
}

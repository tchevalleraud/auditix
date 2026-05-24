<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Add CollectionRuleExtract.block_captures — per-block named captures
 * (list of {name, regex, group}) exposed to blockKeyTemplate as ${name}.
 */
final class Version20260524180000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add CollectionRuleExtract.block_captures column';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule_extract ADD block_captures JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection_rule_extract DROP block_captures');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260409130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Drop topology collection rule tables';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule_model');
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule');
        $this->addSql('DROP TABLE IF EXISTS topology_collection_rule_folder');
    }

    public function down(Schema $schema): void
    {
        // Intentionally left empty – the original entities are removed.
    }
}

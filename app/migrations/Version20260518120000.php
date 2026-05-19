<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add topology.map_options for map-wide visual options (parallel link aggregation, etc.).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology ADD COLUMN IF NOT EXISTS map_options JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology DROP COLUMN IF EXISTS map_options');
    }
}

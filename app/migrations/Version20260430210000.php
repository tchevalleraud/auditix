<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260430210000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add sort_config on inventory_category for default row ordering';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE inventory_category ADD COLUMN IF NOT EXISTS sort_config JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE inventory_category DROP COLUMN IF EXISTS sort_config');
    }
}

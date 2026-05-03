<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260503100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add node_columns_config JSON column on context';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context ADD COLUMN node_columns_config JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE context DROP COLUMN node_columns_config');
    }
}

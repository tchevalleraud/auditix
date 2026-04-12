<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260413200000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add product_model to node, remove product_range_id from device_model';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE node ADD COLUMN IF NOT EXISTS product_model VARCHAR(255) DEFAULT NULL');
        $this->addSql('ALTER TABLE device_model DROP COLUMN IF EXISTS product_range_id');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model ADD COLUMN IF NOT EXISTS product_range_id INT DEFAULT NULL REFERENCES product_range(id) ON DELETE SET NULL');
        $this->addSql('ALTER TABLE node DROP COLUMN IF EXISTS product_model');
    }
}

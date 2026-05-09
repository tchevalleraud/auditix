<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260509100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add pending_tags column to collection — defer tag swap until after a successful collect, enabling rollback on failure';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection ADD COLUMN IF NOT EXISTS pending_tags JSON DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE collection DROP COLUMN IF EXISTS pending_tags');
    }
}

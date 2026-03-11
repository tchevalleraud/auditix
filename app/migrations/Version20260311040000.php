<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260311040000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add blocks JSON column to report';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report ADD blocks JSON NOT NULL DEFAULT '[]'");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE report DROP COLUMN blocks');
    }
}

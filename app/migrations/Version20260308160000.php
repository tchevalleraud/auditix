<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add send_ctrl_y option to device_model';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model ADD send_ctrl_y BOOLEAN NOT NULL DEFAULT false');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model DROP send_ctrl_y');
    }
}

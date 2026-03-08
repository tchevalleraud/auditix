<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260308163000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Replace send_ctrl_y boolean with send_ctrl_char varchar on device_model';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model ADD send_ctrl_char VARCHAR(1) DEFAULT NULL');
        $this->addSql("UPDATE device_model SET send_ctrl_char = 'Y' WHERE send_ctrl_y = true");
        $this->addSql('ALTER TABLE device_model DROP send_ctrl_y');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE device_model ADD send_ctrl_y BOOLEAN NOT NULL DEFAULT false');
        $this->addSql("UPDATE device_model SET send_ctrl_y = true WHERE send_ctrl_char IS NOT NULL");
        $this->addSql('ALTER TABLE device_model DROP send_ctrl_char');
    }
}

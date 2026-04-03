<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260403010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add report type, report_node join table, and generated_files column';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE report ADD COLUMN type VARCHAR(10) NOT NULL DEFAULT 'general'");
        $this->addSql("ALTER TABLE report ADD COLUMN generated_files JSON DEFAULT NULL");

        $this->addSql('CREATE TABLE report_node (
            report_id INT NOT NULL,
            node_id INT NOT NULL,
            PRIMARY KEY (report_id, node_id)
        )');
        $this->addSql('CREATE INDEX IDX_report_node_report ON report_node (report_id)');
        $this->addSql('CREATE INDEX IDX_report_node_node ON report_node (node_id)');
        $this->addSql('ALTER TABLE report_node ADD CONSTRAINT FK_report_node_report FOREIGN KEY (report_id) REFERENCES report (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE report_node ADD CONSTRAINT FK_report_node_node FOREIGN KEY (node_id) REFERENCES node (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE report_node');
        $this->addSql('ALTER TABLE report DROP COLUMN type');
        $this->addSql('ALTER TABLE report DROP COLUMN generated_files');
    }
}

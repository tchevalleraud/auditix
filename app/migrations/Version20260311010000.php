<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260311010000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create report_theme and report tables';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE report_theme (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            primary_color VARCHAR(20) NOT NULL DEFAULT \'#1e293b\',
            secondary_color VARCHAR(20) NOT NULL DEFAULT \'#3b82f6\',
            font_family VARCHAR(100) NOT NULL DEFAULT \'Inter\',
            heading_font_family VARCHAR(100) DEFAULT NULL,
            font_size INT NOT NULL DEFAULT 11,
            context_id INT DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            CONSTRAINT fk_report_theme_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE
        )');
        $this->addSql('CREATE INDEX idx_report_theme_context ON report_theme (context_id)');
        $this->addSql('COMMENT ON COLUMN report_theme.created_at IS \'(DC2Type:datetime_immutable)\'');

        $this->addSql('CREATE TABLE report (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            type VARCHAR(20) NOT NULL DEFAULT \'word\',
            title VARCHAR(255) NOT NULL DEFAULT \'\',
            subtitle VARCHAR(255) DEFAULT NULL,
            show_table_of_contents BOOLEAN NOT NULL DEFAULT TRUE,
            show_authors_page BOOLEAN NOT NULL DEFAULT TRUE,
            show_revision_page BOOLEAN NOT NULL DEFAULT FALSE,
            show_illustrations_page BOOLEAN NOT NULL DEFAULT FALSE,
            tags JSON DEFAULT NULL,
            context_id INT NOT NULL,
            theme_id INT DEFAULT NULL,
            created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
            updated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL,
            CONSTRAINT fk_report_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE,
            CONSTRAINT fk_report_theme FOREIGN KEY (theme_id) REFERENCES report_theme (id) ON DELETE SET NULL
        )');
        $this->addSql('CREATE INDEX idx_report_context ON report (context_id)');
        $this->addSql('CREATE INDEX idx_report_theme ON report (theme_id)');
        $this->addSql('COMMENT ON COLUMN report.created_at IS \'(DC2Type:datetime_immutable)\'');
        $this->addSql('COMMENT ON COLUMN report.updated_at IS \'(DC2Type:datetime_immutable)\'');

        // Insert default theme
        $this->addSql("INSERT INTO report_theme (name, description, is_default, primary_color, secondary_color, font_family, heading_font_family, font_size, context_id, created_at)
            VALUES ('Classic', 'Default classic theme with clean typography', TRUE, '#1e293b', '#3b82f6', 'Inter', NULL, 11, NULL, NOW())");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS report');
        $this->addSql('DROP TABLE IF EXISTS report_theme');
    }
}

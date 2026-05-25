<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Create report_schema table backing the Excalidraw-style schema editor that
 * lives under Rapports → Schémas and feeds the new `schema` report block.
 */
final class Version20260525130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create report_schema table for custom Excalidraw-style schemas embeddable in reports.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS report_schema (
                id SERIAL PRIMARY KEY,
                context_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                viewport JSON DEFAULT NULL,
                canvas_size JSON DEFAULT NULL,
                grid_size INTEGER NOT NULL DEFAULT 20,
                snap_to_grid BOOLEAN NOT NULL DEFAULT TRUE,
                elements JSON NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_report_schema_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_report_schema_context ON report_schema (context_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS report_schema');
    }
}

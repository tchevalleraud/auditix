<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Create shape_library and shape_library_item tables backing the reusable shape
 * libraries (stencils) of the schema editor. Libraries are scoped per context and
 * may be managed read-only by a vendor plugin (managed_by_plugin).
 */
final class Version20260528100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create shape_library and shape_library_item tables for reusable schema shapes (stencils).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS shape_library (
                id SERIAL PRIMARY KEY,
                context_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT NULL,
                managed_by_plugin VARCHAR(128) DEFAULT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_shape_library_context FOREIGN KEY (context_id) REFERENCES context (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_shape_library_context ON shape_library (context_id)');

        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS shape_library_item (
                id SERIAL PRIMARY KEY,
                library_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                keywords VARCHAR(255) DEFAULT NULL,
                payload JSON NOT NULL,
                width DOUBLE PRECISION NOT NULL DEFAULT 0,
                height DOUBLE PRECISION NOT NULL DEFAULT 0,
                preview_svg TEXT DEFAULT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_shape_library_item_library FOREIGN KEY (library_id) REFERENCES shape_library (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_shape_library_item_library ON shape_library_item (library_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS shape_library_item');
        $this->addSql('DROP TABLE IF EXISTS shape_library');
    }
}

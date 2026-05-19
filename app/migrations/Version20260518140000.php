<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518140000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create topology_annotation for free-form design elements (text, image, shape).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            CREATE TABLE IF NOT EXISTS topology_annotation (
                id SERIAL PRIMARY KEY,
                topology_id INTEGER NOT NULL,
                type VARCHAR(16) NOT NULL,
                x DOUBLE PRECISION NOT NULL DEFAULT 0,
                y DOUBLE PRECISION NOT NULL DEFAULT 0,
                width DOUBLE PRECISION NOT NULL DEFAULT 120,
                height DOUBLE PRECISION NOT NULL DEFAULT 40,
                rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
                z_index INTEGER NOT NULL DEFAULT 0,
                data JSON NOT NULL,
                created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
                CONSTRAINT fk_topology_annotation_topology FOREIGN KEY (topology_id) REFERENCES topology (id) ON DELETE CASCADE
            )
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_annotation_topology ON topology_annotation (topology_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_annotation');
    }
}

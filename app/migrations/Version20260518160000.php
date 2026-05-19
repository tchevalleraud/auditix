<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260518160000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add topology_cluster.protocol_id so protocols can auto-generate clusters (ISIS areas).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_cluster ADD COLUMN IF NOT EXISTS protocol_id INTEGER DEFAULT NULL');
        $this->addSql(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_topology_cluster_protocol') THEN
                    ALTER TABLE topology_cluster ADD CONSTRAINT fk_topology_cluster_protocol
                        FOREIGN KEY (protocol_id) REFERENCES topology_protocol (id) ON DELETE SET NULL;
                END IF;
            END $$;
        SQL);
        $this->addSql('CREATE INDEX IF NOT EXISTS idx_topology_cluster_protocol ON topology_cluster (protocol_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE topology_cluster DROP CONSTRAINT IF EXISTS fk_topology_cluster_protocol');
        $this->addSql('DROP INDEX IF EXISTS idx_topology_cluster_protocol');
        $this->addSql('ALTER TABLE topology_cluster DROP COLUMN IF EXISTS protocol_id');
    }
}

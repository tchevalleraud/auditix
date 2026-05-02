<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260502130000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Worker pool settings: per-queue container/process scaling configuration';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
CREATE TABLE worker_pool_settings (
    queue VARCHAR(64) NOT NULL,
    service_name VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    min_containers INT NOT NULL DEFAULT 1,
    max_containers INT NOT NULL DEFAULT 1,
    min_processes_per_container INT NOT NULL DEFAULT 1,
    max_processes_per_container INT NOT NULL DEFAULT 2,
    scale_up_threshold INT NOT NULL DEFAULT 5,
    scale_down_idle_seconds INT NOT NULL DEFAULT 120,
    memory_limit_mb INT NOT NULL DEFAULT 256,
    created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(queue)
)
SQL);

        $this->addSql(<<<'SQL'
INSERT INTO worker_pool_settings (queue, service_name, min_containers, max_containers, min_processes_per_container, max_processes_per_container, memory_limit_mb) VALUES
    ('monitoring', 'worker-monitoring', 1, 2, 2, 4, 256),
    ('collector', 'worker-collector', 1, 3, 2, 4, 256),
    ('generator', 'worker-generator', 1, 2, 1, 2, 512),
    ('compliance', 'worker-compliance', 1, 2, 1, 2, 256),
    ('vulnerability', 'worker-vulnerability', 1, 1, 1, 1, 256),
    ('system_update', 'worker-system-update', 1, 1, 1, 1, 256)
SQL);
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS worker_pool_settings');
    }
}

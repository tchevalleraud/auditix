<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Heal stale compliance grades: a node that no longer has any compliance result
 * from an enabled policy (e.g. removed from a policy by auto-match sync) used to
 * keep its old grade. Clear compliance_score for every such node so it shows no
 * grade instead of a misleading leftover (e.g. "F"). Forward-only data fix.
 */
final class Version20260529120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Clear stale compliance_score for nodes without any enabled-policy result';
    }

    public function up(Schema $schema): void
    {
        $this->addSql(<<<'SQL'
            UPDATE node
            SET compliance_score = NULL
            WHERE compliance_score IS NOT NULL
              AND id NOT IN (
                SELECT DISTINCT cr.node_id
                FROM compliance_result cr
                INNER JOIN compliance_policy cp ON cp.id = cr.policy_id
                WHERE cp.enabled = true
              )
        SQL);
    }

    public function down(Schema $schema): void
    {
        // Data heal — nothing to revert.
    }
}

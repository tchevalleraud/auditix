<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Drop legacy v1 topology tables (TopologyMap / TopologyDevice / TopologyLink).
 * The v2 topology stack (Topology / TopologyNode / TopologyEdge / TopologyCluster /
 * TopologyProtocol / TopologyAnnotation) fully replaces them. Reports that
 * still reference v1 maps via the structure block will simply render nothing
 * for that block — the legacy fields were already stripped from the editor.
 */
final class Version20260525120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Drop legacy topology tables (topology_map / topology_device / topology_link)';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('DROP TABLE IF EXISTS topology_link CASCADE');
        $this->addSql('DROP TABLE IF EXISTS topology_device CASCADE');
        $this->addSql('DROP TABLE IF EXISTS topology_map CASCADE');
    }

    public function down(Schema $schema): void
    {
        // Irreversible drop: data was discarded along with the v1 codebase.
        $this->throwIrreversibleMigrationException(
            'Legacy topology tables cannot be restored — their data was deleted with the v1 code.'
        );
    }
}

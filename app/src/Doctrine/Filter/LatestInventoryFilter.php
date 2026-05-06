<?php

namespace App\Doctrine\Filter;

use App\Entity\NodeInventoryEntry;
use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

/**
 * Restrict NodeInventoryEntry queries to the snapshot bound to the "latest"
 * tag of each node. Disable this filter explicitly for endpoints that
 * intentionally read other tag snapshots, or for write paths (DELETE/UPDATE)
 * scoped to a specific collection tag.
 */
class LatestInventoryFilter extends SQLFilter
{
    public const NAME = 'latest_inventory';

    public function addFilterConstraint(ClassMetadata $targetEntity, $targetTableAlias): string
    {
        if ($targetEntity->getName() !== NodeInventoryEntry::class) {
            return '';
        }

        return sprintf(
            "EXISTS (SELECT 1 FROM collection_tag _lit WHERE _lit.id = %s.collection_tag_id AND _lit.name = 'latest')",
            $targetTableAlias
        );
    }
}

<?php

namespace App\Service;

use Doctrine\ORM\QueryBuilder;
use Symfony\Component\HttpFoundation\Request;

/**
 * Builds reusable WHERE clauses to filter Node queries by tags / manufacturers /
 * models / profiles. All multi-id filters use OR logic between values within the
 * same dimension (any of the selected tags) and AND logic between dimensions.
 */
class NodeFilterService
{
    /**
     * @return array{tagIds: int[], manufacturerIds: int[], modelIds: int[], profileIds: int[]}
     */
    public function parseFromRequest(Request $request): array
    {
        return [
            'tagIds' => $this->parseIntList($request->query->get('tagIds')),
            'manufacturerIds' => $this->parseIntList($request->query->get('manufacturerIds')),
            'modelIds' => $this->parseIntList($request->query->get('modelIds')),
            'profileIds' => $this->parseIntList($request->query->get('profileIds')),
        ];
    }

    public function isEmpty(array $filters): bool
    {
        return empty($filters['tagIds']) && empty($filters['manufacturerIds'])
            && empty($filters['modelIds']) && empty($filters['profileIds']);
    }

    /**
     * Apply filters to a QueryBuilder where $alias points to a Node row.
     *
     * @param array{tagIds?: int[], manufacturerIds?: int[], modelIds?: int[], profileIds?: int[]} $filters
     */
    public function applyToQuery(QueryBuilder $qb, string $alias, array $filters, string $paramSuffix = ''): void
    {
        if (!empty($filters['tagIds'])) {
            $tagAlias = "_nft_t{$paramSuffix}";
            $qb->innerJoin("$alias.tags", $tagAlias)
                ->andWhere("$tagAlias.id IN (:nft_tagIds{$paramSuffix})")
                ->setParameter("nft_tagIds{$paramSuffix}", $filters['tagIds']);
        }
        if (!empty($filters['manufacturerIds'])) {
            $qb->andWhere("$alias.manufacturer IN (:nft_mfrs{$paramSuffix})")
                ->setParameter("nft_mfrs{$paramSuffix}", $filters['manufacturerIds']);
        }
        if (!empty($filters['modelIds'])) {
            $qb->andWhere("$alias.model IN (:nft_models{$paramSuffix})")
                ->setParameter("nft_models{$paramSuffix}", $filters['modelIds']);
        }
        if (!empty($filters['profileIds'])) {
            $qb->andWhere("$alias.profile IN (:nft_profiles{$paramSuffix})")
                ->setParameter("nft_profiles{$paramSuffix}", $filters['profileIds']);
        }
    }

    private function parseIntList(?string $raw): array
    {
        if (!$raw) {
            return [];
        }
        $ids = array_filter(array_map('intval', explode(',', $raw)), fn($v) => $v > 0);
        return array_values(array_unique($ids));
    }
}

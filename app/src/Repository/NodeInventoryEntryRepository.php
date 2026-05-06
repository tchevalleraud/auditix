<?php

namespace App\Repository;

use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class NodeInventoryEntryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, NodeInventoryEntry::class);
    }

    /**
     * Fetch entries for a node restricted to its current "latest" snapshot.
     * @param array<string, mixed> $criteria additional WHERE clauses on the entry
     * @return NodeInventoryEntry[]
     */
    public function findLatestForNode(Node $node, array $criteria = []): array
    {
        $qb = $this->createQueryBuilder('e')
            ->innerJoin('e.collectionTag', 't')
            ->where('e.node = :node')
            ->andWhere('t.name = :tag')
            ->setParameter('node', $node)
            ->setParameter('tag', 'latest');

        foreach ($criteria as $field => $value) {
            $qb->andWhere("e.$field = :crit_$field")
                ->setParameter("crit_$field", $value);
        }

        return $qb->getQuery()->getResult();
    }
}

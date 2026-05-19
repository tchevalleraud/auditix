<?php

namespace App\Repository;

use App\Entity\EnforceResult;
use App\Entity\Node;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class EnforceResultRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, EnforceResult::class);
    }

    /**
     * @return EnforceResult[]
     */
    public function findRecentByNode(Node $node, int $limit = 100): array
    {
        return $this->findBy(['node' => $node], ['executedAt' => 'DESC'], $limit);
    }
}

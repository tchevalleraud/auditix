<?php

namespace App\Repository;

use App\Entity\CollectionRuleExtract;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CollectionRuleExtract>
 */
class CollectionRuleExtractRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CollectionRuleExtract::class);
    }
}

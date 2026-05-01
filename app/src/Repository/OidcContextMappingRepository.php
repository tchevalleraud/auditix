<?php

namespace App\Repository;

use App\Entity\OidcContextMapping;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OidcContextMapping>
 */
class OidcContextMappingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OidcContextMapping::class);
    }

    /** @return list<OidcContextMapping> */
    public function findByProvider(int $providerId): array
    {
        return $this->createQueryBuilder('m')
            ->where('m.provider = :p')
            ->setParameter('p', $providerId)
            ->orderBy('m.id', 'ASC')
            ->getQuery()
            ->getResult();
    }
}

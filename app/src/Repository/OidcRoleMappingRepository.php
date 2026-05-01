<?php

namespace App\Repository;

use App\Entity\OidcRoleMapping;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OidcRoleMapping>
 */
class OidcRoleMappingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OidcRoleMapping::class);
    }

    /** @return list<OidcRoleMapping> */
    public function findByProvider(int $providerId): array
    {
        return $this->createQueryBuilder('m')
            ->where('m.provider = :p')
            ->setParameter('p', $providerId)
            ->orderBy('m.priority', 'DESC')
            ->addOrderBy('m.id', 'ASC')
            ->getQuery()
            ->getResult();
    }
}

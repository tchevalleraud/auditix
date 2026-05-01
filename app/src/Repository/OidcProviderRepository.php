<?php

namespace App\Repository;

use App\Entity\OidcProvider;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OidcProvider>
 */
class OidcProviderRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OidcProvider::class);
    }

    /** @return list<OidcProvider> */
    public function findAllOrdered(): array
    {
        return $this->createQueryBuilder('p')
            ->orderBy('p.sortOrder', 'ASC')
            ->addOrderBy('p.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /** @return list<OidcProvider> */
    public function findEnabled(): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.enabled = TRUE')
            ->orderBy('p.sortOrder', 'ASC')
            ->addOrderBy('p.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findBySlug(string $slug): ?OidcProvider
    {
        return $this->findOneBy(['slug' => $slug]);
    }
}

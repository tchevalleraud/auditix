<?php

namespace App\Repository;

use App\Entity\SyslogServer;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SyslogServer>
 */
class SyslogServerRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SyslogServer::class);
    }

    /** @return list<SyslogServer> */
    public function findAllOrdered(): array
    {
        return $this->createQueryBuilder('s')
            ->orderBy('s.name', 'ASC')
            ->addOrderBy('s.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /** @return list<SyslogServer> */
    public function findEnabled(): array
    {
        return $this->createQueryBuilder('s')
            ->where('s.enabled = true')
            ->orderBy('s.id', 'ASC')
            ->getQuery()
            ->getResult();
    }
}

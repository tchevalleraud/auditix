<?php

namespace App\Repository;

use App\Entity\Schedule;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class ScheduleRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Schedule::class);
    }

    /** @return Schedule[] */
    public function findDueSchedules(\DateTimeImmutable $now): array
    {
        return $this->createQueryBuilder('s')
            ->where('s.enabled = true')
            ->andWhere('s.currentPhase IS NULL')
            ->andWhere('s.nextRunAt IS NOT NULL')
            ->andWhere('s.nextRunAt <= :now')
            ->setParameter('now', $now)
            ->getQuery()
            ->getResult();
    }
}

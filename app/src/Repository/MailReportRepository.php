<?php

namespace App\Repository;

use App\Entity\Context;
use App\Entity\MailReport;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<MailReport>
 */
class MailReportRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, MailReport::class);
    }

    /** @return list<MailReport> */
    public function findByContext(Context $context): array
    {
        return $this->createQueryBuilder('m')
            ->andWhere('m.context = :ctx')
            ->setParameter('ctx', $context)
            ->orderBy('m.name', 'ASC')
            ->getQuery()
            ->getResult();
    }
}

<?php

namespace App\Repository;

use App\Entity\Node;
use App\Entity\Report;
use App\Entity\ReportWordVersion;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ReportWordVersion>
 */
class ReportWordVersionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ReportWordVersion::class);
    }

    /**
     * @return ReportWordVersion[] newest first
     */
    public function findForReport(Report $report): array
    {
        return $this->createQueryBuilder('v')
            ->andWhere('v.report = :report')
            ->setParameter('report', $report)
            ->orderBy('v.createdAt', 'DESC')
            ->addOrderBy('v.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Next incremental version number for a report, scoped per node when given.
     */
    public function nextVersionNumber(Report $report, ?Node $node): int
    {
        $qb = $this->createQueryBuilder('v')
            ->select('MAX(v.versionNumber)')
            ->andWhere('v.report = :report')
            ->setParameter('report', $report);

        if ($node !== null) {
            $qb->andWhere('v.node = :node')->setParameter('node', $node);
        } else {
            $qb->andWhere('v.node IS NULL');
        }

        $max = $qb->getQuery()->getSingleScalarResult();

        return ((int) $max) + 1;
    }

    /**
     * Clear the `current` flag for a report scope (per node when given).
     */
    public function clearCurrent(Report $report, ?Node $node): void
    {
        $qb = $this->createQueryBuilder('v')
            ->update()
            ->set('v.isCurrent', 'false')
            ->andWhere('v.report = :report')
            ->andWhere('v.isCurrent = true')
            ->setParameter('report', $report);

        if ($node !== null) {
            $qb->andWhere('v.node = :node')->setParameter('node', $node);
        } else {
            $qb->andWhere('v.node IS NULL');
        }

        $qb->getQuery()->execute();
    }

    /**
     * Most recent ready version in a scope, used to auto-promote a new current
     * version after the current one is deleted.
     */
    public function findLatestReady(Report $report, ?Node $node): ?ReportWordVersion
    {
        $qb = $this->createQueryBuilder('v')
            ->andWhere('v.report = :report')
            ->andWhere('v.status IS NULL')
            ->andWhere('v.filePath IS NOT NULL')
            ->setParameter('report', $report)
            ->orderBy('v.versionNumber', 'DESC')
            ->setMaxResults(1);

        if ($node !== null) {
            $qb->andWhere('v.node = :node')->setParameter('node', $node);
        } else {
            $qb->andWhere('v.node IS NULL');
        }

        return $qb->getQuery()->getOneOrNullResult();
    }
}

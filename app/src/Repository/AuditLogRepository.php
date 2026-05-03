<?php

namespace App\Repository;

use App\Entity\AuditLog;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AuditLog>
 */
class AuditLogRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AuditLog::class);
    }

    /**
     * @param array{category?:string|null,level?:string|null,search?:string|null,since?:\DateTimeImmutable|null} $filters
     * @return array{items:list<AuditLog>,total:int}
     */
    public function search(array $filters, int $page, int $limit): array
    {
        $qb = $this->createQueryBuilder('a');

        if (!empty($filters['category'])) {
            $qb->andWhere('a.category = :category')->setParameter('category', $filters['category']);
        }
        if (!empty($filters['level'])) {
            $qb->andWhere('a.level = :level')->setParameter('level', $filters['level']);
        }
        if (!empty($filters['search'])) {
            $qb->andWhere('(a.message LIKE :s OR a.action LIKE :s OR a.actor LIKE :s)')
                ->setParameter('s', '%' . $filters['search'] . '%');
        }
        if (!empty($filters['since']) && $filters['since'] instanceof \DateTimeImmutable) {
            $qb->andWhere('a.loggedAt >= :since')->setParameter('since', $filters['since']);
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(a.id)')->getQuery()->getSingleScalarResult();

        $items = $qb->orderBy('a.loggedAt', 'DESC')
            ->addOrderBy('a.id', 'DESC')
            ->setFirstResult(max(0, ($page - 1) * $limit))
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'total' => $total];
    }

    public function deleteOlderThan(\DateTimeImmutable $cutoff): int
    {
        return (int) $this->createQueryBuilder('a')
            ->delete()
            ->where('a.loggedAt < :cutoff')
            ->setParameter('cutoff', $cutoff)
            ->getQuery()
            ->execute();
    }
}

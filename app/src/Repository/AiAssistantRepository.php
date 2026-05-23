<?php

namespace App\Repository;

use App\Entity\AiAssistant;
use App\Entity\Context;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AiAssistant>
 */
class AiAssistantRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AiAssistant::class);
    }

    /** @return list<AiAssistant> */
    public function findByContext(Context $context): array
    {
        return $this->createQueryBuilder('a')
            ->where('a.context = :ctx')
            ->setParameter('ctx', $context)
            ->orderBy('a.name', 'ASC')
            ->addOrderBy('a.id', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Assistants reachable by a given user: enabled, in a context the user
     * belongs to (or any context for admins). When $context is provided, the
     * list is further restricted to that context — the chat panel uses this
     * to scope the picker to whatever the user has currently selected.
     *
     * @return list<AiAssistant>
     */
    public function findReachableByUser(User $user, bool $isAdmin, ?Context $context = null): array
    {
        $qb = $this->createQueryBuilder('a')
            ->innerJoin('a.context', 'c')
            ->innerJoin('a.provider', 'p')
            ->where('a.enabled = true')
            ->andWhere('p.enabled = true')
            ->orderBy('c.name', 'ASC')
            ->addOrderBy('a.name', 'ASC');

        if ($context !== null) {
            $qb->andWhere('c = :ctx')->setParameter('ctx', $context);
        }

        if (!$isAdmin) {
            $qb->innerJoin('c.users', 'cu')
                ->andWhere('cu = :user')
                ->setParameter('user', $user);
        }

        return $qb->getQuery()->getResult();
    }
}

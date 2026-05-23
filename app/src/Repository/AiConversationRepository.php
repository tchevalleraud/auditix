<?php

namespace App\Repository;

use App\Entity\AiAssistant;
use App\Entity\AiConversation;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AiConversation>
 */
class AiConversationRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AiConversation::class);
    }

    /** @return list<AiConversation> */
    public function findForUserAndAssistant(User $user, AiAssistant $assistant): array
    {
        return $this->createQueryBuilder('c')
            ->where('c.user = :user')
            ->andWhere('c.assistant = :assistant')
            ->setParameter('user', $user)
            ->setParameter('assistant', $assistant)
            ->orderBy('c.updatedAt', 'DESC')
            ->getQuery()
            ->getResult();
    }
}

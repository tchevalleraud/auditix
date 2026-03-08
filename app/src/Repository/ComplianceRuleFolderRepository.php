<?php

namespace App\Repository;

use App\Entity\ComplianceRuleFolder;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ComplianceRuleFolder>
 */
class ComplianceRuleFolderRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ComplianceRuleFolder::class);
    }
}

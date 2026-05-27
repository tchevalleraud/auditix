<?php

namespace App\Repository;

use App\Entity\InstalledPlugin;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/** @extends ServiceEntityRepository<InstalledPlugin> */
class InstalledPluginRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, InstalledPlugin::class);
    }

    public function findByIdentifier(string $identifier): ?InstalledPlugin
    {
        return $this->findOneBy(['identifier' => $identifier]);
    }

    /**
     * @return InstalledPlugin[]
     */
    public function findLoadable(): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.signatureStatus IN (:statuses)')
            ->setParameter('statuses', [InstalledPlugin::SIGNATURE_OFFICIAL, InstalledPlugin::SIGNATURE_COMMUNITY])
            ->orderBy('p.identifier', 'ASC')
            ->getQuery()
            ->getResult();
    }
}

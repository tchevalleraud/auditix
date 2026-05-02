<?php

namespace App\Repository;

use App\Entity\NginxConfig;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<NginxConfig>
 */
class NginxConfigRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, NginxConfig::class);
    }

    public function getSingleton(): NginxConfig
    {
        $config = $this->find(NginxConfig::SINGLETON_ID);
        if ($config === null) {
            $config = new NginxConfig();
            $em = $this->getEntityManager();
            $em->persist($config);
            $em->flush();
        }
        return $config;
    }
}

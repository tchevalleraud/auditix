<?php

namespace App\Repository;

use App\Entity\AuthSettings;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AuthSettings>
 */
class AuthSettingsRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AuthSettings::class);
    }

    public function getSingleton(): AuthSettings
    {
        $config = $this->find(AuthSettings::SINGLETON_ID);
        if ($config === null) {
            $config = new AuthSettings();
            $em = $this->getEntityManager();
            $em->persist($config);
            $em->flush();
        }
        return $config;
    }
}

<?php

namespace App\Repository;

use App\Entity\CollectionTag;
use App\Entity\Node;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class CollectionTagRepository extends ServiceEntityRepository
{
    public const LATEST = 'latest';

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CollectionTag::class);
    }

    public function findOneByNodeAndName(Node $node, string $name): ?CollectionTag
    {
        return $this->findOneBy(['node' => $node, 'name' => $name]);
    }

    public function findLatestForNode(Node $node): ?CollectionTag
    {
        return $this->findOneByNodeAndName($node, self::LATEST);
    }

    /**
     * @return CollectionTag[]
     */
    public function findByNode(Node $node): array
    {
        return $this->findBy(['node' => $node], ['createdAt' => 'DESC']);
    }
}

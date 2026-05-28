<?php

namespace App\Repository;

use App\Entity\ShapeLibraryItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ShapeLibraryItem>
 */
class ShapeLibraryItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ShapeLibraryItem::class);
    }
}

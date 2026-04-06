<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Message\ProcessInventoryMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class ProcessInventoryMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly CollectNodeMessageHandler $collectHandler,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    public function __invoke(ProcessInventoryMessage $message): void
    {
        $collection = $this->em->getRepository(Collection::class)->find($message->getCollectionId());
        if (!$collection) return;

        $node = $collection->getNode();
        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();

        if (!is_dir($baseDir)) return;

        $this->collectHandler->processInventoryRules($collection, $node, $baseDir);
    }
}

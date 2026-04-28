<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Message\ProcessInventoryMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;

#[AsMessageHandler]
class ProcessInventoryMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly CollectNodeMessageHandler $collectHandler,
        private readonly HubInterface $hub,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    public function __invoke(ProcessInventoryMessage $message): void
    {
        $collection = $this->em->getRepository(Collection::class)->find($message->getCollectionId());
        if (!$collection) return;

        $node = $collection->getNode();
        $nodeId = $node->getId();
        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();

        if (!is_dir($baseDir)) return;

        $this->publishExtractionEvent($nodeId, 'running');

        try {
            $this->collectHandler->processInventoryRules($collection, $node, $baseDir);
            $this->publishExtractionEvent($nodeId, 'completed');
        } catch (\Throwable $e) {
            $this->publishExtractionEvent($nodeId, 'failed', $e->getMessage());
            throw $e;
        }
    }

    private function publishExtractionEvent(int $nodeId, string $status, ?string $error = null): void
    {
        $this->hub->publish(new Update(
            'extractions/node/' . $nodeId,
            json_encode([
                'event' => 'extraction.updated',
                'nodeId' => $nodeId,
                'status' => $status,
                'error' => $error,
            ]),
        ));
    }
}

<?php

namespace App\MessageHandler;

use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Node;
use App\Message\RecalculateNodeScoreMessage;
use App\Message\SyncCveMessage;
use App\Service\CveSyncService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsMessageHandler]
class SyncCveMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly CveSyncService $syncService,
        private readonly MessageBusInterface $bus,
        private readonly HubInterface $hub,
    ) {}

    public function __invoke(SyncCveMessage $message): void
    {
        $context = $this->em->getRepository(Context::class)->find($message->getContextId());
        if (!$context) return;

        $this->publishStatus($context, 'running');

        try {
            if ($message->getDeviceModelId()) {
                $model = $this->em->getRepository(DeviceModel::class)->find($message->getDeviceModelId());
                if (!$model) return;
                $result = $this->syncService->syncDeviceModel($model, $context, $context->getNvdApiKey());
                $summary = ['synced' => $result['synced'], 'new' => $result['new'], 'updated' => $result['updated'], 'errors' => []];
            } else {
                $summary = $this->syncService->syncContext($context);
            }

            $status = empty($summary['errors']) ? 'success' : 'partial';
            $context->setLastVulnerabilitySyncAt(new \DateTimeImmutable());
            $context->setLastVulnerabilitySyncStatus($status);
            $this->em->flush();

            // Recalculate scores for all nodes in this context
            $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
            foreach ($nodes as $node) {
                if ($node->getModel()) {
                    $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
                }
            }

            $this->publishStatus($context, 'completed', $summary);
        } catch (\Throwable $e) {
            $context->setLastVulnerabilitySyncAt(new \DateTimeImmutable());
            $context->setLastVulnerabilitySyncStatus('error');
            $this->em->flush();

            $this->publishStatus($context, 'error', ['message' => $e->getMessage()]);
        }
    }

    private function publishStatus(Context $context, string $status, array $data = []): void
    {
        $payload = json_encode(array_merge([
            'event' => 'vulnerability.sync',
            'contextId' => $context->getId(),
            'status' => $status,
        ], $data));

        $this->hub->publish(new Update('vulnerability/sync/' . $context->getId(), $payload));
    }
}

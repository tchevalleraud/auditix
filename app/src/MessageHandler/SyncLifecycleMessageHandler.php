<?php

namespace App\MessageHandler;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\ProductRange;
use App\Entity\VendorPlugin;
use App\Message\RecalculateNodeScoreMessage;
use App\Message\SyncLifecycleMessage;
use App\Plugin\VendorPluginRegistry;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsMessageHandler]
class SyncLifecycleMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly VendorPluginRegistry $pluginRegistry,
        private readonly MessageBusInterface $bus,
        private readonly HubInterface $hub,
    ) {}

    public function __invoke(SyncLifecycleMessage $message): void
    {
        $context = $this->em->getRepository(Context::class)->find($message->getContextId());
        if (!$context) return;

        $this->publishStatus($context, 'running');

        try {
            $pluginId = $message->getPluginIdentifier();
            $synced = 0;
            $errors = [];

            if ($pluginId) {
                // Sync a single plugin
                $result = $this->syncPlugin($pluginId, $context);
                $synced += $result['synced'];
                if ($result['error']) $errors[] = $result['error'];

                // Update plugin status in database
                $vp = $this->em->getRepository(VendorPlugin::class)->findOneBy([
                    'context' => $context,
                    'pluginIdentifier' => $pluginId,
                ]);
                if ($vp) {
                    $vp->setLastSyncAt(new \DateTimeImmutable());
                    $vp->setLastSyncStatus($result['error'] ? 'error' : 'success');
                }
            } else {
                // Sync all enabled plugins for this context
                $vendorPlugins = $this->em->getRepository(VendorPlugin::class)->findBy([
                    'context' => $context,
                    'enabled' => true,
                ]);

                foreach ($vendorPlugins as $vp) {
                    $result = $this->syncPlugin($vp->getPluginIdentifier(), $context);
                    $synced += $result['synced'];
                    if ($result['error']) $errors[] = $result['error'];

                    $vp->setLastSyncAt(new \DateTimeImmutable());
                    $vp->setLastSyncStatus($result['error'] ? 'error' : 'success');
                }
            }

            $this->em->flush();

            // Recalculate scores for nodes with a product range
            $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
            foreach ($nodes as $node) {
                $model = $node->getModel();
                if ($model && $model->getProductRange()) {
                    $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
                }
            }

            $status = empty($errors) ? 'success' : 'partial';
            $this->publishStatus($context, 'completed', [
                'synced' => $synced,
                'errors' => $errors,
                'status' => $status,
            ]);
        } catch (\Throwable $e) {
            $this->publishStatus($context, 'error', ['message' => $e->getMessage()]);
        }
    }

    /**
     * @return array{synced: int, error: ?string}
     */
    private function syncPlugin(string $pluginIdentifier, Context $context): array
    {
        $plugin = $this->pluginRegistry->get($pluginIdentifier);
        if (!$plugin) {
            return ['synced' => 0, 'error' => "Plugin '$pluginIdentifier' not found"];
        }

        // Get plugin config from database
        $vpEntity = $this->em->getRepository(VendorPlugin::class)->findOneBy([
            'context' => $context,
            'pluginIdentifier' => $pluginIdentifier,
        ]);
        $config = $vpEntity?->getConfiguration() ?? [];

        try {
            $lifecycleEntries = $plugin->fetchLifecycleData($context, $config);
        } catch (\Throwable $e) {
            return ['synced' => 0, 'error' => $e->getMessage()];
        }

        $synced = 0;
        $productRangeRepo = $this->em->getRepository(ProductRange::class);
        $seen = []; // track already-processed names to avoid duplicates

        foreach ($lifecycleEntries as $entry) {
            // Skip duplicate entries with the same name
            if (isset($seen[$entry->productRangeName])) {
                continue;
            }
            $seen[$entry->productRangeName] = true;

            // Find or create ProductRange
            $range = $productRangeRepo->findOneBy([
                'name' => $entry->productRangeName,
                'context' => $context,
            ]);

            if (!$range) {
                $range = new ProductRange();
                $range->setName($entry->productRangeName);
                $range->setContext($context);
                // Try to resolve manufacturer from plugin
                $manufacturers = $plugin->getSupportedManufacturers();
                $editorRepo = $this->em->getRepository(\App\Entity\Editor::class);
                foreach ($manufacturers as $mfr) {
                    $editor = $editorRepo->findOneBy(['name' => $mfr]);
                    if ($editor) {
                        $range->setManufacturer($editor);
                        break;
                    }
                }
                $this->em->persist($range);
            }

            // Update lifecycle data
            if ($entry->recommendedVersion !== null) {
                $range->setRecommendedVersion($entry->recommendedVersion);
            }
            if ($entry->currentVersion !== null) {
                $range->setCurrentVersion($entry->currentVersion);
            }
            if ($entry->releaseDate !== null) {
                $range->setReleaseDate($entry->releaseDate);
            }
            if ($entry->endOfSaleDate !== null) {
                $range->setEndOfSaleDate($entry->endOfSaleDate);
            }
            if ($entry->endOfSupportDate !== null) {
                $range->setEndOfSupportDate($entry->endOfSupportDate);
            }
            if ($entry->endOfLifeDate !== null) {
                $range->setEndOfLifeDate($entry->endOfLifeDate);
            }

            $range->setPluginSource($pluginIdentifier);
            $range->setLastSyncedAt(new \DateTimeImmutable());

            $synced++;
        }

        $this->em->flush();

        return ['synced' => $synced, 'error' => null];
    }

    private function publishStatus(Context $context, string $status, array $data = []): void
    {
        $payload = json_encode(array_merge([
            'event' => 'lifecycle.sync',
            'contextId' => $context->getId(),
            'status' => $status,
        ], $data));

        $this->hub->publish(new Update('lifecycle/sync/' . $context->getId(), $payload));
    }
}

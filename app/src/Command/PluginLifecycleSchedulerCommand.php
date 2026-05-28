<?php

namespace App\Command;

use App\Entity\VendorPlugin;
use App\Message\SyncLifecycleMessage;
use App\Plugin\Capability\ProvidesLifecycleData;
use App\Plugin\VendorPluginRegistry;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:plugin:lifecycle-scheduler',
    description: 'Dispatches lifecycle sync messages for plugins per their configured sync_interval',
)]
class PluginLifecycleSchedulerCommand extends Command
{
    private const TICK_INTERVAL = 60;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
        private readonly VendorPluginRegistry $registry,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('Plugin lifecycle scheduler started.');

        // In-memory guard so a slow sync (lastSyncAt not yet persisted) is not
        // re-dispatched every tick: key "contextId:identifier" => unix timestamp.
        $lastDispatch = [];

        while (true) {
            $this->em->clear();
            $now = time();

            $vendorPlugins = $this->em->getRepository(VendorPlugin::class)->findBy(['enabled' => true]);

            foreach ($vendorPlugins as $vp) {
                $identifier = $vp->getPluginIdentifier();
                $context = $vp->getContext();
                if ($identifier === null || $context === null) {
                    continue;
                }

                $plugin = $this->registry->get($identifier);
                if (!$plugin instanceof ProvidesLifecycleData) {
                    continue;
                }

                $config = $vp->getConfiguration() ?? [];
                $interval = (int) ($config['sync_interval'] ?? 0);
                if ($interval <= 0) {
                    continue; // manual only
                }

                $key = $context->getId() . ':' . $identifier;
                $lastSync = $vp->getLastSyncAt()?->getTimestamp() ?? 0;
                $reference = max($lastSync, $lastDispatch[$key] ?? 0);

                if (($now - $reference) < $interval) {
                    continue;
                }

                $this->bus->dispatch(new SyncLifecycleMessage($context->getId(), $identifier));
                $lastDispatch[$key] = $now;
                $output->writeln(sprintf(
                    '[%s] Dispatched lifecycle sync for "%s" (context %d).',
                    date('Y-m-d H:i:s'),
                    $identifier,
                    $context->getId(),
                ));
            }

            sleep(self::TICK_INTERVAL);
        }
    }
}

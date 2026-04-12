<?php

namespace App\Command;

use App\Entity\Context;
use App\Message\SyncLifecycleMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:system-update:sync',
    description: 'Dispatch lifecycle data synchronization for enabled contexts',
)]
class SystemUpdateSyncCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('context', null, InputOption::VALUE_REQUIRED, 'Sync only a specific context ID');
        $this->addOption('plugin', null, InputOption::VALUE_REQUIRED, 'Sync only a specific plugin identifier');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $contextId = $input->getOption('context');
        $pluginId = $input->getOption('plugin');

        if ($contextId) {
            $context = $this->em->getRepository(Context::class)->find((int) $contextId);
            if (!$context) {
                $output->writeln('<error>Context not found.</error>');
                return Command::FAILURE;
            }
            $this->bus->dispatch(new SyncLifecycleMessage($context->getId(), $pluginId));
            $output->writeln(sprintf('Dispatched lifecycle sync for context "%s" (#%d).', $context->getName(), $context->getId()));
            return Command::SUCCESS;
        }

        $contexts = $this->em->getRepository(Context::class)->findBy(['systemUpdateEnabled' => true]);

        if (empty($contexts)) {
            $output->writeln('No contexts with system update scanning enabled.');
            return Command::SUCCESS;
        }

        foreach ($contexts as $context) {
            $this->bus->dispatch(new SyncLifecycleMessage($context->getId(), $pluginId));
            $output->writeln(sprintf('Dispatched lifecycle sync for context "%s" (#%d).', $context->getName(), $context->getId()));
        }

        return Command::SUCCESS;
    }
}

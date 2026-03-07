<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\Node;
use App\Message\PingNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:monitoring:scheduler',
    description: 'Dispatches ping messages for all nodes in monitoring-enabled contexts every 60 seconds',
)]
class MonitoringSchedulerCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('Monitoring scheduler started.');

        while (true) {
            $this->em->clear();

            $contexts = $this->em->getRepository(Context::class)->findBy(['monitoringEnabled' => true]);

            $dispatched = 0;
            foreach ($contexts as $context) {
                $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
                foreach ($nodes as $node) {
                    $this->bus->dispatch(new PingNodeMessage($node->getId()));
                    $dispatched++;
                }
            }

            $output->writeln(sprintf('[%s] Dispatched %d ping(s).', date('Y-m-d H:i:s'), $dispatched));

            sleep(60);
        }
    }
}

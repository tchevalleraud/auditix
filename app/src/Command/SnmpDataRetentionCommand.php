<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\Node;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:snmp-data:retention',
    description: 'Deletes SNMP monitoring data older than the context retention period',
)]
class SnmpDataRetentionCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('loop', null, InputOption::VALUE_NONE, 'Run continuously every 5 minutes');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $loop = $input->getOption('loop');

        do {
            $this->em->clear();

            $contexts = $this->em->getRepository(Context::class)->findBy(['monitoringEnabled' => true]);
            $totalDeleted = 0;

            foreach ($contexts as $context) {
                $retentionMinutes = $context->getSnmpRetentionMinutes();
                $cutoff = new \DateTimeImmutable("-{$retentionMinutes} minutes");

                $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
                $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

                if (empty($nodeIds)) {
                    continue;
                }

                $deleted = $this->em->createQuery(
                    'DELETE App\Entity\SnmpMonitoringData d WHERE d.node IN (:nodeIds) AND d.recordedAt < :cutoff'
                )
                    ->setParameter('nodeIds', $nodeIds)
                    ->setParameter('cutoff', $cutoff)
                    ->execute();

                $totalDeleted += $deleted;
            }

            $output->writeln(sprintf('[%s] Cleaned up %d SNMP data point(s).', date('Y-m-d H:i:s'), $totalDeleted));

            if ($loop) {
                sleep(300);
            }
        } while ($loop);

        return Command::SUCCESS;
    }
}

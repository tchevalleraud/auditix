<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\Task;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:tasks:cleanup',
    description: 'Deletes old tasks and SNMP monitoring data based on retention settings',
)]
class TaskCleanupCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('retention', 'r', InputOption::VALUE_REQUIRED, 'Task retention period (e.g. "1 hour", "30 minutes")', '1 hour');
        $this->addOption('loop', null, InputOption::VALUE_NONE, 'Run continuously every 30 seconds');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $retention = $input->getOption('retention');
        $loop = $input->getOption('loop');

        do {
            $this->em->clear();

            // --- Task cleanup ---
            $cutoff = new \DateTimeImmutable("-{$retention}");

            $deletedTasks = $this->em->getRepository(Task::class)->createQueryBuilder('t')
                ->delete()
                ->where('t.createdAt < :cutoff')
                ->andWhere('t.status IN (:statuses)')
                ->setParameter('cutoff', $cutoff)
                ->setParameter('statuses', [Task::STATUS_COMPLETED, Task::STATUS_FAILED])
                ->getQuery()
                ->execute();

            // --- SNMP data retention per context ---
            $deletedSnmp = 0;
            $contexts = $this->em->getRepository(Context::class)->findBy(['monitoringEnabled' => true]);

            foreach ($contexts as $context) {
                $retentionMinutes = $context->getSnmpRetentionMinutes();
                $snmpCutoff = new \DateTimeImmutable("-{$retentionMinutes} minutes");

                $nodeIds = array_map(
                    fn(Node $n) => $n->getId(),
                    $this->em->getRepository(Node::class)->findBy(['context' => $context])
                );

                if (empty($nodeIds)) {
                    continue;
                }

                $deletedSnmp += $this->em->createQuery(
                    'DELETE App\Entity\SnmpMonitoringData d WHERE d.node IN (:nodeIds) AND d.recordedAt < :cutoff'
                )
                    ->setParameter('nodeIds', $nodeIds)
                    ->setParameter('cutoff', $snmpCutoff)
                    ->execute();
            }

            $output->writeln(sprintf(
                '[%s] Cleaned up %d task(s) older than %s, %d SNMP data point(s).',
                date('Y-m-d H:i:s'),
                $deletedTasks,
                $retention,
                $deletedSnmp
            ));

            if ($loop) {
                sleep(30);
            }
        } while ($loop);

        return Command::SUCCESS;
    }
}

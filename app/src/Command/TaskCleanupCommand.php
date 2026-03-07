<?php

namespace App\Command;

use App\Entity\Task;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:tasks:cleanup',
    description: 'Deletes completed/failed tasks older than the retention period',
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
        $this->addOption('retention', 'r', InputOption::VALUE_REQUIRED, 'Retention period (e.g. "1 hour", "30 minutes")', '1 hour');
        $this->addOption('loop', null, InputOption::VALUE_NONE, 'Run continuously every 5 minutes');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $retention = $input->getOption('retention');
        $loop = $input->getOption('loop');

        do {
            $this->em->clear();

            $cutoff = new \DateTimeImmutable("-{$retention}");

            $deleted = $this->em->getRepository(Task::class)->createQueryBuilder('t')
                ->delete()
                ->where('t.createdAt < :cutoff')
                ->andWhere('t.status IN (:statuses)')
                ->setParameter('cutoff', $cutoff)
                ->setParameter('statuses', [Task::STATUS_COMPLETED, Task::STATUS_FAILED])
                ->getQuery()
                ->execute();

            $output->writeln(sprintf('[%s] Cleaned up %d task(s) older than %s.', date('Y-m-d H:i:s'), $deleted, $retention));

            if ($loop) {
                sleep(300);
            }
        } while ($loop);

        return Command::SUCCESS;
    }
}

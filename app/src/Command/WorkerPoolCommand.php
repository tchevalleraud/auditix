<?php

namespace App\Command;

use App\Entity\WorkerPoolSettings;
use App\Repository\WorkerPoolSettingsRepository;
use App\Service\RabbitMqManagementClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Process\Process;

#[AsCommand(
    name: 'app:worker:pool',
    description: 'Runs a self-scaling pool of messenger:consume processes for a given queue',
)]
class WorkerPoolCommand extends Command
{
    private const POLL_INTERVAL = 5;

    /** @var array<int, array{process: Process, startedAt: int, busySince: ?int}> */
    private array $children = [];
    private bool $shutdown = false;
    private int $lastBusyAt = 0;

    public function __construct(
        private readonly WorkerPoolSettingsRepository $repository,
        private readonly RabbitMqManagementClient $rabbitClient,
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('queue', InputArgument::REQUIRED, 'Queue name (monitoring, collector, generator, ...)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $queue = (string) $input->getArgument('queue');
        if (!in_array($queue, WorkerPoolSettings::QUEUES, true)) {
            $output->writeln('<error>Unknown queue: ' . $queue . '</error>');
            return Command::INVALID;
        }

        if (function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, fn() => $this->shutdown = true);
            pcntl_signal(SIGINT, fn() => $this->shutdown = true);
        }

        $output->writeln(sprintf('[worker-pool:%s] starting', $queue));
        $this->lastBusyAt = time();

        while (!$this->shutdown) {
            $this->reapDeadChildren($output);

            $settings = $this->loadSettings($queue);
            $desired = $this->decideDesiredProcesses($queue, $settings);

            $current = count($this->children);
            if ($current < $desired) {
                for ($i = 0; $i < $desired - $current; $i++) {
                    $this->spawnChild($queue, $settings, $output);
                }
            } elseif ($current > $desired) {
                $this->stopExtraChildren($current - $desired, $output);
            }

            for ($i = 0; $i < self::POLL_INTERVAL && !$this->shutdown; $i++) {
                sleep(1);
            }
        }

        $output->writeln(sprintf('[worker-pool:%s] shutting down %d children', $queue, count($this->children)));
        $this->stopAllChildren();
        return Command::SUCCESS;
    }

    private function loadSettings(string $queue): WorkerPoolSettings
    {
        $this->em->clear();
        $settings = $this->repository->findByQueue($queue);
        if ($settings === null) {
            $settings = new WorkerPoolSettings($queue, 'worker-' . str_replace('_', '-', $queue));
        }
        return $settings;
    }

    private function decideDesiredProcesses(string $queue, WorkerPoolSettings $settings): int
    {
        if (!$settings->isEnabled()) {
            return 0;
        }

        $min = $settings->getMinProcessesPerContainer();
        $max = $settings->getMaxProcessesPerContainer();

        $stats = $this->rabbitClient->getQueueStats($queue);
        $now = time();

        if ($stats === null) {
            return $min;
        }

        $ready = $stats['ready'];
        $unacked = $stats['unacked'];
        $consumers = max(1, $stats['consumers']);
        $currentChildren = count($this->children);

        if ($unacked > 0 || $ready > 0) {
            $this->lastBusyAt = $now;
        }

        $threshold = $settings->getScaleUpThreshold();
        $idleSeconds = $settings->getScaleDownIdleSeconds();

        // Backlog par consumer
        $backlogPerConsumer = $ready / $consumers;

        if ($backlogPerConsumer >= $threshold && $currentChildren < $max) {
            return min($max, $currentChildren + 1);
        }

        if ($ready === 0 && $unacked === 0 && $currentChildren > $min && ($now - $this->lastBusyAt) >= $idleSeconds) {
            return max($min, $currentChildren - 1);
        }

        return max($min, min($max, $currentChildren ?: $min));
    }

    private function spawnChild(string $queue, WorkerPoolSettings $settings, OutputInterface $output): void
    {
        $memory = $settings->getMemoryLimitMb();
        $process = new Process([
            'php',
            '-d',
            'memory_limit=' . $memory . 'M',
            'bin/console',
            'messenger:consume',
            $queue,
            '--time-limit=3600',
            '--memory-limit=' . $memory . 'M',
        ], $this->projectDir);
        $process->setTimeout(null);
        $process->start(function (string $type, string $buffer) use ($output, $queue): void {
            foreach (preg_split('/\R/', rtrim($buffer)) as $line) {
                if ($line === '') {
                    continue;
                }
                $output->writeln(sprintf('[%s] %s', $queue, $line));
            }
        });

        $this->children[$process->getPid() ?? spl_object_id($process)] = [
            'process' => $process,
            'startedAt' => time(),
            'busySince' => null,
        ];

        $output->writeln(sprintf('[worker-pool:%s] spawned child pid=%s (pool=%d)', $queue, $process->getPid(), count($this->children)));
    }

    private function reapDeadChildren(OutputInterface $output): void
    {
        foreach ($this->children as $key => $entry) {
            if (!$entry['process']->isRunning()) {
                $exit = $entry['process']->getExitCode();
                $output->writeln(sprintf('[worker-pool] child exited code=%s', $exit ?? 'null'));
                unset($this->children[$key]);
            }
        }
    }

    private function stopExtraChildren(int $count, OutputInterface $output): void
    {
        $sorted = $this->children;
        uasort($sorted, fn($a, $b) => $b['startedAt'] <=> $a['startedAt']);
        $i = 0;
        foreach ($sorted as $key => $entry) {
            if ($i >= $count) {
                break;
            }
            $entry['process']->signal(SIGTERM);
            $output->writeln(sprintf('[worker-pool] sent SIGTERM to pid=%s', $entry['process']->getPid()));
            $i++;
        }
    }

    private function stopAllChildren(): void
    {
        foreach ($this->children as $entry) {
            try {
                $entry['process']->signal(SIGTERM);
            } catch (\Throwable) {}
        }
        $deadline = time() + 30;
        while (!empty($this->children) && time() < $deadline) {
            $this->reapDeadChildrenSilent();
            usleep(200_000);
        }
        foreach ($this->children as $entry) {
            try {
                $entry['process']->stop(0);
            } catch (\Throwable) {}
        }
        $this->children = [];
    }

    private function reapDeadChildrenSilent(): void
    {
        foreach ($this->children as $key => $entry) {
            if (!$entry['process']->isRunning()) {
                unset($this->children[$key]);
            }
        }
    }
}

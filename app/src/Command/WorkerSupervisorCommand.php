<?php

namespace App\Command;

use App\Service\WorkerContainerScaler;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:worker:supervisor',
    description: 'Supervises worker containers and scales them up/down based on queue load',
)]
class WorkerSupervisorCommand extends Command
{
    private const TICK_INTERVAL = 10;

    private bool $shutdown = false;

    public function __construct(
        private readonly WorkerContainerScaler $scaler,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if (function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, fn() => $this->shutdown = true);
            pcntl_signal(SIGINT, fn() => $this->shutdown = true);
        }

        $output->writeln('Worker supervisor started.');
        $this->scaler->setLogger($this->logger);

        while (!$this->shutdown) {
            try {
                $this->em->clear();
                $results = $this->scaler->reconcileAll();
                foreach ($results as $r) {
                    if ($r['action'] !== 'noop') {
                        $output->writeln(sprintf(
                            '[%s] %s: %s -> %s (%s) %s',
                            date('H:i:s'),
                            $r['queue'],
                            $r['action'],
                            $r['desired'],
                            $r['current'],
                            $r['message'] ?? '',
                        ));
                    }
                }
            } catch (\Throwable $e) {
                $output->writeln('<error>' . $e->getMessage() . '</error>');
                $this->logger->error('Supervisor tick error', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            }

            for ($i = 0; $i < self::TICK_INTERVAL && !$this->shutdown; $i++) {
                sleep(1);
            }
        }

        $output->writeln('Worker supervisor stopped.');
        return Command::SUCCESS;
    }
}

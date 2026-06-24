<?php

namespace App\Command;

use App\Entity\Report;
use App\Message\GenerateReportWordMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:report:generate-word',
    description: 'Queue Word (.docx) generation for a report (creates a new version)',
)]
class GenerateReportWordCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('reportId', InputArgument::REQUIRED, 'Report ID');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $reportId = (int) $input->getArgument('reportId');
        $report = $this->em->getRepository(Report::class)->find($reportId);
        if (!$report) {
            $io->error(sprintf('Report %d not found', $reportId));

            return Command::FAILURE;
        }

        $this->bus->dispatch(new GenerateReportWordMessage($reportId, 'cli'));
        $io->success(sprintf('Queued Word generation for report "%s" (#%d)', $report->getName(), $reportId));

        return Command::SUCCESS;
    }
}

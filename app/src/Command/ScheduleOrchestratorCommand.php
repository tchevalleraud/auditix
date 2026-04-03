<?php

namespace App\Command;

use App\Entity\Collection;
use App\Entity\CompliancePolicy;
use App\Entity\Node;
use App\Entity\Report;
use App\Entity\Schedule;
use App\Message\CollectNodeMessage;
use App\Message\EvaluateComplianceMessage;
use App\Message\GenerateReportMessage;
use App\Repository\ScheduleRepository;
use Cron\CronExpression;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:schedule:orchestrator',
    description: 'Orchestrates scheduled tasks: collection, compliance, report generation',
)]
class ScheduleOrchestratorCommand extends Command
{
    private const TICK_INTERVAL = 10;
    private const TIMEOUT_SECONDS = 7200; // 2 hours

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('Schedule orchestrator started.');

        while (true) {
            $this->em->clear();
            $now = new \DateTimeImmutable();

            try {
                $this->processDueSchedules($now, $output);
                $this->processActiveSchedules($now, $output);
            } catch (\Throwable $e) {
                $output->writeln('<error>' . $e->getMessage() . '</error>');
            }

            sleep(self::TICK_INTERVAL);
        }
    }

    private function processDueSchedules(\DateTimeImmutable $now, OutputInterface $output): void
    {
        /** @var ScheduleRepository $repo */
        $repo = $this->em->getRepository(Schedule::class);
        $dueSchedules = $repo->findDueSchedules($now);

        foreach ($dueSchedules as $schedule) {
            $firstPhase = $schedule->getFirstPhase();
            if (!$firstPhase) {
                $this->computeNextRun($schedule);
                $this->em->flush();
                continue;
            }

            $output->writeln(sprintf('[%s] Starting schedule "%s" — phase: %s', $now->format('H:i:s'), $schedule->getName(), $firstPhase));

            $schedule->setLastTriggeredAt($now);
            $schedule->setCurrentPhase($firstPhase);
            $schedule->setCurrentPhaseStatus(Schedule::STATUS_DISPATCHING);
            $this->em->flush();
        }
    }

    private function processActiveSchedules(\DateTimeImmutable $now, OutputInterface $output): void
    {
        $schedules = $this->em->getRepository(Schedule::class)->findBy([
            'currentPhase' => [Schedule::PHASE_COLLECTION, Schedule::PHASE_COMPLIANCE, Schedule::PHASE_REPORT],
        ]);

        foreach ($schedules as $schedule) {
            // Timeout safety
            if ($this->isTimedOut($schedule, $now)) {
                $output->writeln(sprintf('[%s] Schedule "%s" timed out — resetting', $now->format('H:i:s'), $schedule->getName()));
                $this->resetSchedule($schedule);
                continue;
            }

            if ($schedule->getCurrentPhaseStatus() === Schedule::STATUS_DISPATCHING) {
                $this->dispatchPhase($schedule, $output);
            } elseif ($schedule->getCurrentPhaseStatus() === Schedule::STATUS_RUNNING) {
                $this->checkPhaseCompletion($schedule, $output);
            }
        }
    }

    private function dispatchPhase(Schedule $schedule, OutputInterface $output): void
    {
        $phase = $schedule->getCurrentPhase();

        switch ($phase) {
            case Schedule::PHASE_COLLECTION:
                $this->dispatchCollection($schedule, $output);
                break;
            case Schedule::PHASE_COMPLIANCE:
                $this->dispatchCompliance($schedule, $output);
                break;
            case Schedule::PHASE_REPORT:
                $this->dispatchReport($schedule, $output);
                break;
        }
    }

    private function dispatchCollection(Schedule $schedule, OutputInterface $output): void
    {
        $nodeIds = $schedule->getCollectionNodeIds() ?? [];
        $nodes = $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $context = $schedule->getContext();
        $collectionIds = [];

        foreach ($nodes as $node) {
            // Release 'latest' tag from previous collections
            $existing = $this->em->getRepository(Collection::class)->findBy(['node' => $node]);
            foreach ($existing as $c) {
                if (in_array('latest', $c->getTags(), true)) {
                    $c->removeTag('latest');
                }
            }

            $collection = new Collection();
            $collection->setNode($node);
            $collection->setContext($context);
            $collection->setTags(['latest']);

            $this->em->persist($collection);
            $collectionIds[] = null; // placeholder, will get IDs after flush
        }

        $this->em->flush();

        // Now get the IDs and dispatch
        $realIds = [];
        $nodeIndex = 0;
        foreach ($nodes as $node) {
            // Find the collection we just created
            $collections = $this->em->getRepository(Collection::class)->findBy(
                ['node' => $node, 'status' => Collection::STATUS_PENDING],
                ['createdAt' => 'DESC'],
                1
            );
            if (!empty($collections)) {
                $c = $collections[0];
                $realIds[] = $c->getId();
                $this->bus->dispatch(new CollectNodeMessage($c->getId()));
            }
            $nodeIndex++;
        }

        $schedule->setCollectionIds($realIds);
        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();

        $output->writeln(sprintf('  Dispatched %d collection(s)', count($realIds)));
    }

    private function dispatchCompliance(Schedule $schedule, OutputInterface $output): void
    {
        $nodeIds = $schedule->getComplianceNodeIds() ?? [];
        $nodes = $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $dispatched = 0;

        foreach ($nodes as $node) {
            $policies = $this->em->createQuery(
                'SELECT p FROM App\Entity\CompliancePolicy p JOIN p.nodes n WHERE n = :node AND p.enabled = true'
            )->setParameter('node', $node)->getResult();

            if (empty($policies)) {
                continue;
            }

            foreach ($policies as $policy) {
                $this->bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
                $dispatched++;
            }

            $node->setScore(null);
            $node->setComplianceEvaluating('pending');
        }

        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();

        $output->writeln(sprintf('  Dispatched %d compliance evaluation(s)', $dispatched));
    }

    private function dispatchReport(Schedule $schedule, OutputInterface $output): void
    {
        $reportIds = $schedule->getReportIds() ?? [];
        $reports = $this->em->getRepository(Report::class)->findBy(['id' => $reportIds]);
        $dispatched = 0;

        foreach ($reports as $report) {
            if ($report->getGeneratingStatus() !== null) {
                continue;
            }
            $report->setGeneratingStatus('pending');
            $this->bus->dispatch(new GenerateReportMessage($report->getId()));
            $dispatched++;
        }

        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();

        $output->writeln(sprintf('  Dispatched %d report generation(s)', $dispatched));
    }

    private function checkPhaseCompletion(Schedule $schedule, OutputInterface $output): void
    {
        $phase = $schedule->getCurrentPhase();
        $allDone = false;

        switch ($phase) {
            case Schedule::PHASE_COLLECTION:
                $allDone = $this->isCollectionDone($schedule);
                break;
            case Schedule::PHASE_COMPLIANCE:
                $allDone = $this->isComplianceDone($schedule);
                break;
            case Schedule::PHASE_REPORT:
                $allDone = $this->isReportDone($schedule);
                break;
        }

        if ($allDone) {
            $output->writeln(sprintf('  Phase "%s" completed for schedule "%s"', $phase, $schedule->getName()));
            $this->transitionToNextPhase($schedule, $output);
        }
    }

    private function isCollectionDone(Schedule $schedule): bool
    {
        $collectionIds = $schedule->getCollectionIds();
        if (empty($collectionIds)) {
            return true;
        }

        $collections = $this->em->getRepository(Collection::class)->findBy(['id' => $collectionIds]);
        foreach ($collections as $c) {
            if (!in_array($c->getStatus(), [Collection::STATUS_COMPLETED, Collection::STATUS_FAILED], true)) {
                return false;
            }
        }
        return true;
    }

    private function isComplianceDone(Schedule $schedule): bool
    {
        $nodeIds = $schedule->getComplianceNodeIds();
        if (empty($nodeIds)) {
            return true;
        }

        $nodes = $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        foreach ($nodes as $node) {
            if ($node->getComplianceEvaluating() !== null) {
                return false;
            }
        }
        return true;
    }

    private function isReportDone(Schedule $schedule): bool
    {
        $reportIds = $schedule->getReportIds();
        if (empty($reportIds)) {
            return true;
        }

        $reports = $this->em->getRepository(Report::class)->findBy(['id' => $reportIds]);
        foreach ($reports as $report) {
            if ($report->getGeneratingStatus() !== null) {
                return false;
            }
        }
        return true;
    }

    private function transitionToNextPhase(Schedule $schedule, OutputInterface $output): void
    {
        $currentPhase = $schedule->getCurrentPhase();
        $nextPhase = $schedule->getNextPhase($currentPhase);

        if ($nextPhase) {
            $output->writeln(sprintf('  Transitioning to phase "%s"', $nextPhase));
            $schedule->setCurrentPhase($nextPhase);
            $schedule->setCurrentPhaseStatus(Schedule::STATUS_DISPATCHING);
            $schedule->setCollectionIds(null);
        } else {
            $output->writeln(sprintf('  Schedule "%s" completed all phases', $schedule->getName()));
            $schedule->setCurrentPhase(null);
            $schedule->setCurrentPhaseStatus(null);
            $schedule->setCollectionIds(null);
            $schedule->setLastCompletedAt(new \DateTimeImmutable());
            $this->computeNextRun($schedule);
        }

        $this->em->flush();
    }

    private function resetSchedule(Schedule $schedule): void
    {
        $schedule->setCurrentPhase(null);
        $schedule->setCurrentPhaseStatus(null);
        $schedule->setCollectionIds(null);
        $this->computeNextRun($schedule);
        $this->em->flush();
    }

    private function isTimedOut(Schedule $schedule, \DateTimeImmutable $now): bool
    {
        $triggered = $schedule->getLastTriggeredAt();
        if (!$triggered) {
            return false;
        }
        return ($now->getTimestamp() - $triggered->getTimestamp()) > self::TIMEOUT_SECONDS;
    }

    private function computeNextRun(Schedule $schedule): void
    {
        try {
            $cron = new CronExpression($schedule->getCronExpression());
            $schedule->setNextRunAt(
                \DateTimeImmutable::createFromMutable($cron->getNextRunDate())
            );
        } catch (\Throwable) {
            $schedule->setNextRunAt(null);
        }
    }
}

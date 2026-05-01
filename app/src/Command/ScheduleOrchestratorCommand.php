<?php

namespace App\Command;

use App\Entity\Collection;
use App\Entity\CompliancePolicy;
use App\Entity\MailReport;
use App\Entity\Node;
use App\Entity\Report;
use App\Entity\Schedule;
use App\Message\CollectNodeMessage;
use App\Message\EvaluateComplianceMessage;
use App\Message\GenerateReportMessage;
use App\Message\ProcessInventoryMessage;
use App\Message\SendMailReportMessage;
use App\Repository\ScheduleRepository;
use App\Service\PolicyAutoAssigner;
use App\Service\ScheduleEventPublisher;
use Cron\CronExpression;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:schedule:orchestrator',
    description: 'Orchestrates scheduled tasks: collect, extract, cleanup, compliance, report, mail',
)]
class ScheduleOrchestratorCommand extends Command
{
    private const TICK_INTERVAL = 10;
    private const TIMEOUT_SECONDS = 7200; // 2 hours

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
        private readonly ScheduleEventPublisher $events,
        private readonly HubInterface $hub,
        private readonly PolicyAutoAssigner $policyAutoAssigner,
    ) {
        parent::__construct();
    }

    private function publishCollectionPending(Collection $collection): void
    {
        $node = $collection->getNode();
        $this->hub->publish(new Update(
            'collections/node/' . $node->getId(),
            json_encode([
                'event' => 'collection.updated',
                'collection' => [
                    'id' => $collection->getId(),
                    'nodeId' => $node->getId(),
                    'status' => $collection->getStatus(),
                    'tags' => $collection->getTags(),
                ],
            ]),
        ));
    }

    private function publishExtractionPending(int $nodeId): void
    {
        $this->hub->publish(new Update(
            'extractions/node/' . $nodeId,
            json_encode([
                'event' => 'extraction.updated',
                'nodeId' => $nodeId,
                'status' => 'pending',
            ]),
        ));
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
            $this->events->publish($schedule, 'schedule.phase.changed');
        }
    }

    private function processActiveSchedules(\DateTimeImmutable $now, OutputInterface $output): void
    {
        $schedules = $this->em->getRepository(Schedule::class)->findBy([
            'currentPhase' => [
                Schedule::PHASE_COLLECT,
                Schedule::PHASE_EXTRACT,
                Schedule::PHASE_CLEANUP,
                Schedule::PHASE_COMPLIANCE,
                Schedule::PHASE_REPORT,
                Schedule::PHASE_MAIL,
            ],
        ]);

        foreach ($schedules as $schedule) {
            // Timeout safety
            if ($this->isTimedOut($schedule, $now)) {
                $output->writeln(sprintf('[%s] Schedule "%s" timed out — resetting', $now->format('H:i:s'), $schedule->getName()));
                $this->resetSchedule($schedule);
                $this->events->publish($schedule, 'schedule.timed_out');
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
            case Schedule::PHASE_COLLECT:
                $this->dispatchCollect($schedule, $output);
                break;
            case Schedule::PHASE_EXTRACT:
                $this->dispatchExtract($schedule, $output);
                break;
            case Schedule::PHASE_CLEANUP:
                $this->executeCleanup($schedule, $output);
                break;
            case Schedule::PHASE_COMPLIANCE:
                $this->dispatchCompliance($schedule, $output);
                break;
            case Schedule::PHASE_REPORT:
                $this->dispatchReport($schedule, $output);
                break;
            case Schedule::PHASE_MAIL:
                $this->dispatchMail($schedule, $output);
                break;
        }
    }

    private function dispatchCollect(Schedule $schedule, OutputInterface $output): void
    {
        $nodeIds = $schedule->resolveNodeIds($this->em);
        $nodes = $nodeIds ? $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]) : [];
        $context = $schedule->getContext();

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
        }

        $this->em->flush();

        $realIds = [];
        foreach ($nodes as $node) {
            $collections = $this->em->getRepository(Collection::class)->findBy(
                ['node' => $node, 'status' => Collection::STATUS_PENDING],
                ['createdAt' => 'DESC'],
                1
            );
            if (!empty($collections)) {
                $c = $collections[0];
                $realIds[] = $c->getId();
                $this->publishCollectionPending($c);
                $this->bus->dispatch(new CollectNodeMessage($c->getId()));
            }
        }

        $schedule->setCollectionIds($realIds);
        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();
        $this->events->publish($schedule, 'schedule.phase.dispatched');

        $output->writeln(sprintf('  Dispatched %d collect job(s)', count($realIds)));
    }

    private function dispatchExtract(Schedule $schedule, OutputInterface $output): void
    {
        $nodeIds = $schedule->resolveNodeIds($this->em);
        $collectionIds = [];
        $dispatched = 0;

        foreach ($nodeIds as $nodeId) {
            $latest = $this->em->getRepository(Collection::class)->findOneBy(
                ['node' => $nodeId, 'status' => Collection::STATUS_COMPLETED],
                ['completedAt' => 'DESC'],
            );
            if (!$latest) {
                continue;
            }

            $latest->setExtractStatus(Collection::EXTRACT_STATUS_PENDING);
            $latest->setExtractError(null);
            $collectionIds[] = $latest->getId();
            $this->publishExtractionPending($nodeId);
            $this->bus->dispatch(new ProcessInventoryMessage($latest->getId()));
            $dispatched++;
        }

        $this->em->flush();

        $schedule->setCollectionIds($collectionIds);
        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();
        $this->events->publish($schedule, 'schedule.phase.dispatched');

        $output->writeln(sprintf('  Dispatched %d extract job(s)', $dispatched));
    }

    private function executeCleanup(Schedule $schedule, OutputInterface $output): void
    {
        $context = $schedule->getContext();
        $collections = $this->em->getRepository(Collection::class)->findBy(['context' => $context]);
        $deleted = 0;

        foreach ($collections as $collection) {
            $tags = $collection->getTags();
            if (empty($tags)) {
                $storageDir = '/var/www/var/' . $collection->getStoragePath();
                $this->deleteDirectory($storageDir);

                $this->em->remove($collection);
                $deleted++;
            }
        }

        $this->em->flush();
        $output->writeln(sprintf('  Cleanup: deleted %d collection(s) without tags', $deleted));

        // Cleanup is synchronous, transition immediately
        $this->transitionToNextPhase($schedule, $output);
    }

    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) return;
        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
    }

    private function dispatchCompliance(Schedule $schedule, OutputInterface $output): void
    {
        $nodeIds = $schedule->resolveNodeIds($this->em);
        $nodes = $nodeIds ? $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]) : [];
        $dispatched = 0;

        foreach ($nodes as $node) {
            $policies = $this->policyAutoAssigner->autoAssign($node);

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
        $this->events->publish($schedule, 'schedule.phase.dispatched');

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
        $this->events->publish($schedule, 'schedule.phase.dispatched');

        $output->writeln(sprintf('  Dispatched %d report generation(s)', $dispatched));
    }

    private function dispatchMail(Schedule $schedule, OutputInterface $output): void
    {
        $mailReportIds = $schedule->getMailReportIds() ?? [];
        $reports = $this->em->getRepository(MailReport::class)->findBy(['id' => $mailReportIds]);
        $dispatched = 0;

        foreach ($reports as $report) {
            if ($report->getMailServer() === null) {
                continue;
            }
            $report->setSendingStatus(MailReport::STATUS_PENDING);
            $this->bus->dispatch(new SendMailReportMessage($report->getId()));
            $dispatched++;
        }

        $schedule->setCurrentPhaseStatus(Schedule::STATUS_RUNNING);
        $this->em->flush();
        $this->events->publish($schedule, 'schedule.phase.dispatched');

        $output->writeln(sprintf('  Dispatched %d mail report(s)', $dispatched));
    }

    private function checkPhaseCompletion(Schedule $schedule, OutputInterface $output): void
    {
        $phase = $schedule->getCurrentPhase();
        $allDone = false;

        switch ($phase) {
            case Schedule::PHASE_COLLECT:
                $allDone = $this->isCollectDone($schedule);
                break;
            case Schedule::PHASE_EXTRACT:
                $allDone = $this->isExtractDone($schedule);
                break;
            case Schedule::PHASE_COMPLIANCE:
                $allDone = $this->isComplianceDone($schedule);
                break;
            case Schedule::PHASE_REPORT:
                $allDone = $this->isReportDone($schedule);
                break;
            case Schedule::PHASE_MAIL:
                $allDone = $this->isMailDone($schedule);
                break;
        }

        if ($allDone) {
            $output->writeln(sprintf('  Phase "%s" completed for schedule "%s"', $phase, $schedule->getName()));
            $this->events->publish($schedule, 'schedule.phase.completed');
            $this->transitionToNextPhase($schedule, $output);
        }
    }

    private function isCollectDone(Schedule $schedule): bool
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

    private function isExtractDone(Schedule $schedule): bool
    {
        $collectionIds = $schedule->getCollectionIds();
        if (empty($collectionIds)) {
            return true;
        }

        $collections = $this->em->getRepository(Collection::class)->findBy(['id' => $collectionIds]);
        foreach ($collections as $c) {
            $status = $c->getExtractStatus();
            if (!in_array($status, [Collection::EXTRACT_STATUS_COMPLETED, Collection::EXTRACT_STATUS_FAILED], true)) {
                return false;
            }
        }
        return true;
    }

    private function isComplianceDone(Schedule $schedule): bool
    {
        $nodeIds = $schedule->resolveNodeIds($this->em);
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

    private function isMailDone(Schedule $schedule): bool
    {
        $mailReportIds = $schedule->getMailReportIds();
        if (empty($mailReportIds)) {
            return true;
        }
        $reports = $this->em->getRepository(MailReport::class)->findBy(['id' => $mailReportIds]);
        foreach ($reports as $report) {
            $status = $report->getSendingStatus();
            if ($status !== null && $status !== MailReport::STATUS_SENT && $status !== MailReport::STATUS_FAILED) {
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
            // Keep collectionIds across collect→extract; reset on other transitions
            if ($currentPhase !== Schedule::PHASE_COLLECT || $nextPhase !== Schedule::PHASE_EXTRACT) {
                $schedule->setCollectionIds(null);
            }
            $this->em->flush();
            $this->events->publish($schedule, 'schedule.phase.changed');
        } else {
            $output->writeln(sprintf('  Schedule "%s" completed all phases', $schedule->getName()));
            $schedule->setCurrentPhase(null);
            $schedule->setCurrentPhaseStatus(null);
            $schedule->setCollectionIds(null);
            $schedule->setLastCompletedAt(new \DateTimeImmutable());
            $this->computeNextRun($schedule);
            $this->em->flush();
            $this->events->publish($schedule, 'schedule.completed');
        }
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

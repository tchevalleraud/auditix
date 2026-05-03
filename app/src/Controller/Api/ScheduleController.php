<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Schedule;
use App\Security\Voter\ContextAccessVoter;
use App\Service\ScheduleEventPublisher;
use Cron\CronExpression;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/schedules')]
class ScheduleController extends AbstractController
{
    public function __construct(
        private readonly ScheduleEventPublisher $events,
    ) {}

    private function serialize(Schedule $s): array
    {
        return [
            'id' => $s->getId(),
            'name' => $s->getName(),
            'cronExpression' => $s->getCronExpression(),
            'enabled' => $s->isEnabled(),
            'currentPhase' => $s->getCurrentPhase(),
            'currentPhaseStatus' => $s->getCurrentPhaseStatus(),
            'lastTriggeredAt' => $s->getLastTriggeredAt()?->format('c'),
            'lastCompletedAt' => $s->getLastCompletedAt()?->format('c'),
            'nextRunAt' => $s->getNextRunAt()?->format('c'),
            'nodeSelectionMode' => $s->getNodeSelectionMode(),
            'nodeTagId' => $s->getNodeTagId(),
            'nodeIds' => $s->getNodeIds(),
            'collectEnabled' => $s->isCollectEnabled(),
            'extractEnabled' => $s->isExtractEnabled(),
            'cleanupEnabled' => $s->isCleanupEnabled(),
            'complianceEnabled' => $s->isComplianceEnabled(),
            'reportIds' => $s->getReportIds(),
            'mailReportIds' => $s->getMailReportIds(),
            'createdAt' => $s->getCreatedAt()->format('c'),
            'updatedAt' => $s->getUpdatedAt()?->format('c'),
        ];
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

    private function applyMutableFields(Schedule $schedule, array $data): ?JsonResponse
    {
        if (isset($data['name'])) {
            $schedule->setName($data['name']);
        }
        if (isset($data['cronExpression'])) {
            if (!CronExpression::isValidExpression($data['cronExpression'])) {
                return $this->json(['error' => 'Invalid cron expression'], Response::HTTP_BAD_REQUEST);
            }
            $schedule->setCronExpression($data['cronExpression']);
        }
        if (array_key_exists('enabled', $data)) {
            $schedule->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('nodeSelectionMode', $data)) {
            $mode = $data['nodeSelectionMode'];
            $allowed = [Schedule::NODE_MODE_ALL, Schedule::NODE_MODE_TAG, Schedule::NODE_MODE_INDIVIDUAL, null];
            if (!in_array($mode, $allowed, true)) {
                return $this->json(['error' => 'Invalid nodeSelectionMode'], Response::HTTP_BAD_REQUEST);
            }
            $schedule->setNodeSelectionMode($mode);
        }
        if (array_key_exists('nodeTagId', $data)) {
            $schedule->setNodeTagId($data['nodeTagId'] !== null ? (int) $data['nodeTagId'] : null);
        }
        if (array_key_exists('nodeIds', $data)) {
            $schedule->setNodeIds(!empty($data['nodeIds']) ? array_map('intval', $data['nodeIds']) : null);
        }
        if (array_key_exists('collectEnabled', $data)) {
            $schedule->setCollectEnabled((bool) $data['collectEnabled']);
        }
        if (array_key_exists('extractEnabled', $data)) {
            $schedule->setExtractEnabled((bool) $data['extractEnabled']);
        }
        if (array_key_exists('cleanupEnabled', $data)) {
            $schedule->setCleanupEnabled((bool) $data['cleanupEnabled']);
        }
        if (array_key_exists('complianceEnabled', $data)) {
            $schedule->setComplianceEnabled((bool) $data['complianceEnabled']);
        }
        if (array_key_exists('reportIds', $data)) {
            $schedule->setReportIds(!empty($data['reportIds']) ? array_map('intval', $data['reportIds']) : null);
        }
        if (array_key_exists('mailReportIds', $data)) {
            $schedule->setMailReportIds(!empty($data['mailReportIds']) ? array_map('intval', $data['mailReportIds']) : null);
        }
        return null;
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->get('context');
        if (!$contextId) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $schedules = $em->getRepository(Schedule::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $schedules));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->get('context');

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }
        if (empty($data['cronExpression'])) {
            return $this->json(['error' => 'Cron expression is required'], Response::HTTP_BAD_REQUEST);
        }
        if (!CronExpression::isValidExpression($data['cronExpression'])) {
            return $this->json(['error' => 'Invalid cron expression'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $schedule = new Schedule();
        $schedule->setName($data['name']);
        $schedule->setContext($context);
        $schedule->setCronExpression($data['cronExpression']);

        $error = $this->applyMutableFields($schedule, $data);
        if ($error) return $error;

        $this->computeNextRun($schedule);

        $em->persist($schedule);
        $em->flush();

        $this->events->publish($schedule, 'schedule.created');

        return $this->json($this->serialize($schedule), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Schedule $schedule): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schedule);
        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Schedule $schedule, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schedule);
        $data = json_decode($request->getContent(), true);

        $error = $this->applyMutableFields($schedule, $data);
        if ($error) return $error;

        $this->computeNextRun($schedule);
        $schedule->setUpdatedAt(new \DateTimeImmutable());
        $em->flush();

        $this->events->publish($schedule, 'schedule.updated');

        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schedule);
        $this->events->publish($schedule, 'schedule.deleted');
        $em->remove($schedule);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/trigger', methods: ['POST'])]
    public function trigger(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schedule);
        if (!$schedule->isIdle()) {
            return $this->json(['error' => 'Schedule is already running'], Response::HTTP_CONFLICT);
        }

        $firstPhase = $schedule->getFirstPhase();
        if (!$firstPhase) {
            return $this->json(['error' => 'No phases configured'], Response::HTTP_BAD_REQUEST);
        }

        $schedule->setLastTriggeredAt(new \DateTimeImmutable());
        $schedule->setCurrentPhase($firstPhase);
        $schedule->setCurrentPhaseStatus(Schedule::STATUS_DISPATCHING);
        $em->flush();

        $this->events->publish($schedule, 'schedule.phase.changed');

        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}/cancel', methods: ['POST'])]
    public function cancel(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schedule);
        $schedule->setCurrentPhase(null);
        $schedule->setCurrentPhaseStatus(null);
        $schedule->setCollectionIds(null);
        $this->computeNextRun($schedule);
        $em->flush();

        $this->events->publish($schedule, 'schedule.cancelled');

        return $this->json($this->serialize($schedule));
    }
}

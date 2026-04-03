<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Schedule;
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
            'collectionNodeIds' => $s->getCollectionNodeIds(),
            'complianceNodeIds' => $s->getComplianceNodeIds(),
            'reportIds' => $s->getReportIds(),
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

        $schedule = new Schedule();
        $schedule->setName($data['name']);
        $schedule->setContext($context);
        $schedule->setCronExpression($data['cronExpression']);

        if (isset($data['enabled'])) {
            $schedule->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('collectionNodeIds', $data)) {
            $schedule->setCollectionNodeIds(!empty($data['collectionNodeIds']) ? $data['collectionNodeIds'] : null);
        }
        if (array_key_exists('complianceNodeIds', $data)) {
            $schedule->setComplianceNodeIds(!empty($data['complianceNodeIds']) ? $data['complianceNodeIds'] : null);
        }
        if (array_key_exists('reportIds', $data)) {
            $schedule->setReportIds(!empty($data['reportIds']) ? $data['reportIds'] : null);
        }

        $this->computeNextRun($schedule);

        $em->persist($schedule);
        $em->flush();

        return $this->json($this->serialize($schedule), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Schedule $schedule): JsonResponse
    {
        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Schedule $schedule, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $schedule->setName($data['name']);
        }
        if (isset($data['cronExpression'])) {
            if (!CronExpression::isValidExpression($data['cronExpression'])) {
                return $this->json(['error' => 'Invalid cron expression'], Response::HTTP_BAD_REQUEST);
            }
            $schedule->setCronExpression($data['cronExpression']);
        }
        if (isset($data['enabled'])) {
            $schedule->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('collectionNodeIds', $data)) {
            $schedule->setCollectionNodeIds(!empty($data['collectionNodeIds']) ? $data['collectionNodeIds'] : null);
        }
        if (array_key_exists('complianceNodeIds', $data)) {
            $schedule->setComplianceNodeIds(!empty($data['complianceNodeIds']) ? $data['complianceNodeIds'] : null);
        }
        if (array_key_exists('reportIds', $data)) {
            $schedule->setReportIds(!empty($data['reportIds']) ? $data['reportIds'] : null);
        }

        $this->computeNextRun($schedule);
        $schedule->setUpdatedAt(new \DateTimeImmutable());
        $em->flush();

        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($schedule);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/trigger', methods: ['POST'])]
    public function trigger(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
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

        return $this->json($this->serialize($schedule));
    }

    #[Route('/{id}/cancel', methods: ['POST'])]
    public function cancel(Schedule $schedule, EntityManagerInterface $em): JsonResponse
    {
        $schedule->setCurrentPhase(null);
        $schedule->setCurrentPhaseStatus(null);
        $schedule->setCollectionIds(null);
        $this->computeNextRun($schedule);
        $em->flush();

        return $this->json($this->serialize($schedule));
    }
}

<?php

namespace App\Service;

use App\Entity\Schedule;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;

class ScheduleEventPublisher
{
    public function __construct(
        private readonly HubInterface $hub,
    ) {}

    public function publish(Schedule $schedule, string $event): void
    {
        $payload = json_encode([
            'event' => $event,
            'schedule' => [
                'id' => $schedule->getId(),
                'name' => $schedule->getName(),
                'enabled' => $schedule->isEnabled(),
                'currentPhase' => $schedule->getCurrentPhase(),
                'currentPhaseStatus' => $schedule->getCurrentPhaseStatus(),
                'lastTriggeredAt' => $schedule->getLastTriggeredAt()?->format('c'),
                'lastCompletedAt' => $schedule->getLastCompletedAt()?->format('c'),
                'nextRunAt' => $schedule->getNextRunAt()?->format('c'),
            ],
        ]);

        $this->hub->publish(new Update('schedules', $payload));
        $this->hub->publish(new Update('schedules/' . $schedule->getId(), $payload));
    }
}

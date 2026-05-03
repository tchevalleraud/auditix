<?php

namespace App\EventSubscriber;

use App\Entity\AuditLog;
use App\Service\AuditEntityResolver;
use App\Service\AuditLogger;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\Messenger\Envelope;
use Symfony\Component\Messenger\Event\WorkerMessageFailedEvent;
use Symfony\Component\Messenger\Event\WorkerMessageHandledEvent;
use Symfony\Component\Messenger\Event\WorkerMessageReceivedEvent;
use Symfony\Component\Messenger\Stamp\ReceivedStamp;

class WorkerAuditSubscriber implements EventSubscriberInterface
{
    private ?float $currentStart = null;

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly AuditEntityResolver $resolver,
    ) {}

    public static function getSubscribedEvents(): array
    {
        return [
            WorkerMessageReceivedEvent::class => ['onReceived', 100],
            WorkerMessageHandledEvent::class => ['onHandled', -100],
            WorkerMessageFailedEvent::class => ['onFailed', -100],
        ];
    }

    public function onReceived(WorkerMessageReceivedEvent $event): void
    {
        $this->currentStart = microtime(true);
    }

    public function onHandled(WorkerMessageHandledEvent $event): void
    {
        $envelope = $event->getEnvelope();
        $duration = $this->popDuration();
        $message = $envelope->getMessage();
        $shortName = $this->shortClass($message);
        $details = $this->describeMessage($message);

        $summary = $details === ''
            ? sprintf('%s succeeded in %.0fms', $shortName, $duration * 1000)
            : sprintf('%s succeeded [%s] in %.0fms', $shortName, $details, $duration * 1000);

        $this->audit->log(
            AuditLog::LEVEL_INFO,
            AuditLog::CATEGORY_WORKER,
            'worker.handled',
            $summary,
            $this->workerName(),
            $this->buildContext($envelope, $message, $duration, $event->getReceiverName()),
        );
    }

    public function onFailed(WorkerMessageFailedEvent $event): void
    {
        $envelope = $event->getEnvelope();
        $duration = $this->popDuration();
        $exception = $event->getThrowable();
        $message = $envelope->getMessage();
        $shortName = $this->shortClass($message);
        $details = $this->describeMessage($message);

        $verb = $event->willRetry() ? 'will retry' : 'failed';
        $summary = $details === ''
            ? sprintf('%s %s after %.0fms: %s', $shortName, $verb, $duration * 1000, $exception->getMessage())
            : sprintf('%s %s [%s] after %.0fms: %s', $shortName, $verb, $details, $duration * 1000, $exception->getMessage());

        $context = $this->buildContext(
            $envelope,
            $message,
            $duration,
            $envelope->last(ReceivedStamp::class)?->getTransportName(),
        );
        $context['exception'] = $exception::class;
        $context['exception_message'] = $exception->getMessage();
        $context['will_retry'] = $event->willRetry();

        $this->audit->log(
            $event->willRetry() ? AuditLog::LEVEL_WARNING : AuditLog::LEVEL_ERROR,
            AuditLog::CATEGORY_WORKER,
            $event->willRetry() ? 'worker.retry' : 'worker.failed',
            $summary,
            $this->workerName(),
            $context,
        );
    }

    private function popDuration(): float
    {
        $start = $this->currentStart ?? microtime(true);
        $this->currentStart = null;
        return microtime(true) - $start;
    }

    /**
     * @return array<string,mixed>
     */
    private function buildContext(Envelope $envelope, object $message, float $duration, ?string $transport): array
    {
        $context = [
            'transport' => $transport,
            'message' => $message::class,
            'duration_ms' => round($duration * 1000, 1),
        ];

        foreach (['getNodeId', 'getContextId', 'getCollectionId', 'getReportId', 'getMailReportId', 'getPolicyId', 'getTaskId', 'getDeviceModelId', 'getPluginIdentifier'] as $getter) {
            if (method_exists($message, $getter)) {
                $value = $message->{$getter}();
                if ($value !== null) {
                    $key = lcfirst(substr($getter, 3));
                    $context[$key] = $value;
                }
            }
        }

        return $context;
    }

    private function describeMessage(object $message): string
    {
        $parts = [];

        $nodeId = $this->getter($message, 'getNodeId');
        if ($nodeId !== null) {
            $parts[] = $this->describeNode((int) $nodeId);
        }

        $collectionId = $this->getter($message, 'getCollectionId');
        if ($collectionId !== null) {
            $parts[] = $this->describeCollection((int) $collectionId);
        }

        $policyId = $this->getter($message, 'getPolicyId');
        if ($policyId !== null) {
            $parts[] = $this->describePolicy((int) $policyId);
        }

        $contextId = $this->getter($message, 'getContextId');
        if ($contextId !== null && $nodeId === null) {
            $parts[] = $this->describeContext((int) $contextId);
        }

        $reportId = $this->getter($message, 'getReportId');
        if ($reportId !== null) {
            $parts[] = $this->describeReport((int) $reportId);
        }

        $mailReportId = $this->getter($message, 'getMailReportId');
        if ($mailReportId !== null) {
            $parts[] = $this->describeMailReport((int) $mailReportId);
        }

        $modelId = $this->getter($message, 'getDeviceModelId');
        if ($modelId !== null) {
            $parts[] = $this->describeModel((int) $modelId);
        }

        $plugin = $this->getter($message, 'getPluginIdentifier');
        if ($plugin !== null && $plugin !== '') {
            $parts[] = sprintf('plugin=%s', $plugin);
        }

        return implode(', ', array_filter($parts));
    }

    private function describeNode(int $id): string
    {
        $info = $this->resolver->node($id);
        if ($info === null) {
            return sprintf('node=%d (unknown)', $id);
        }
        $name = isset($info['name']) && $info['name'] !== '' ? $info['name'] : null;
        $ip = $info['ip'] ?? null;
        return match (true) {
            $name !== null && $ip !== null => sprintf('node=%d "%s" %s', $id, $name, $ip),
            $name !== null => sprintf('node=%d "%s"', $id, $name),
            $ip !== null => sprintf('node=%d %s', $id, $ip),
            default => sprintf('node=%d', $id),
        };
    }

    private function describeCollection(int $id): string
    {
        $row = $this->resolver->collection($id);
        if ($row === null) {
            return sprintf('collection=%d (unknown)', $id);
        }
        $nodeId = isset($row['node_id']) ? (int) $row['node_id'] : null;
        if ($nodeId !== null) {
            return sprintf('collection=%d on %s', $id, $this->describeNode($nodeId));
        }
        return sprintf('collection=%d', $id);
    }

    private function describePolicy(int $id): string
    {
        $name = $this->resolver->policyName($id);
        return $name !== null
            ? sprintf('policy=%d "%s"', $id, $name)
            : sprintf('policy=%d', $id);
    }

    private function describeContext(int $id): string
    {
        $name = $this->resolver->contextName($id);
        return $name !== null
            ? sprintf('context=%d "%s"', $id, $name)
            : sprintf('context=%d', $id);
    }

    private function describeReport(int $id): string
    {
        $title = $this->resolver->reportTitle($id);
        return $title !== null
            ? sprintf('report=%d "%s"', $id, $title)
            : sprintf('report=%d', $id);
    }

    private function describeMailReport(int $id): string
    {
        $name = $this->resolver->mailReportName($id);
        return $name !== null
            ? sprintf('mail_report=%d "%s"', $id, $name)
            : sprintf('mail_report=%d', $id);
    }

    private function describeModel(int $id): string
    {
        $name = $this->resolver->modelName($id);
        return $name !== null
            ? sprintf('model=%d "%s"', $id, $name)
            : sprintf('model=%d', $id);
    }

    private function getter(object $message, string $method): mixed
    {
        if (!method_exists($message, $method)) {
            return null;
        }
        try {
            return $message->{$method}();
        } catch (\Throwable) {
            return null;
        }
    }

    private function shortClass(object $obj): string
    {
        $parts = explode('\\', $obj::class);
        $name = end($parts) ?: $obj::class;
        return preg_replace('/Message$/', '', $name) ?? $name;
    }

    private function workerName(): string
    {
        $service = $_ENV['WORKER_SERVICE_NAME'] ?? 'worker';
        $hostname = gethostname() ?: 'unknown';
        return $service . '/' . $hostname;
    }
}

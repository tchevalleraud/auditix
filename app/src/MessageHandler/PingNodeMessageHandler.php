<?php

namespace App\MessageHandler;

use App\Entity\Node;
use App\Entity\SnmpMonitoringData;
use App\Entity\Task;
use App\Message\PingNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Process\Process;

#[AsMessageHandler]
class PingNodeMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
    ) {}

    public function __invoke(PingNodeMessage $message): void
    {
        $node = $this->em->getRepository(Node::class)->find($message->getNodeId());
        if (!$node) {
            return;
        }

        $task = $message->getTaskId()
            ? $this->em->getRepository(Task::class)->find($message->getTaskId())
            : null;

        if (!$task) {
            $task = new Task();
            $task->setType('icmp');
            $task->setNode($node);
            $task->setContext($node->getContext());
            $this->em->persist($task);
        }

        $serviceName = $_ENV['WORKER_SERVICE_NAME'] ?? 'worker';
        $hostname = gethostname() ?: 'unknown';
        $workerName = $serviceName . '/' . $hostname;
        $task->setWorker($workerName);
        $task->setStatus(Task::STATUS_RUNNING);
        $task->setStartedAt(new \DateTimeImmutable());
        $this->em->flush();

        $ip = $node->getIpAddress();
        $process = new Process(['ping', '-c', '1', '-W', '2', $ip]);
        $process->run();

        $reachable = $process->isSuccessful();
        $now = new \DateTimeImmutable();
        $output = trim($process->getOutput() . "\n" . $process->getErrorOutput());

        $node->setIsReachable($reachable);
        $node->setLastPingAt($now);

        $task->setStatus($reachable ? Task::STATUS_COMPLETED : Task::STATUS_FAILED);
        $task->setCompletedAt($now);
        $task->setOutput($output);

        // Store ping metrics
        $statusData = new SnmpMonitoringData();
        $statusData->setNode($node);
        $statusData->setCategory('ping_status');
        $statusData->setOid('icmp');
        $statusData->setRawValue($reachable ? '1' : '0');
        $statusData->setNumericValue($reachable ? 1.0 : 0.0);
        $statusData->setRecordedAt($now);
        $this->em->persist($statusData);

        $latency = $this->parseLatency($output);
        $latencyData = new SnmpMonitoringData();
        $latencyData->setNode($node);
        $latencyData->setCategory('ping_latency');
        $latencyData->setOid('icmp');
        $latencyData->setRawValue($latency !== null ? sprintf('%.2f', $latency) : 'timeout');
        $latencyData->setNumericValue($latency);
        $latencyData->setRecordedAt($now);
        $this->em->persist($latencyData);

        $this->em->flush();

        $context = $node->getContext();
        $this->hub->publish(new Update(
            'nodes/context/' . $context?->getId(),
            json_encode([
                'type' => 'ping',
                'nodeId' => $node->getId(),
                'isReachable' => $reachable,
                'lastPingAt' => $now->format('c'),
            ]),
        ));

        // Notify monitoring tab
        $this->hub->publish(new Update(
            'snmp/node/' . $node->getId(),
            json_encode([
                'event' => 'snmp.polled',
                'nodeId' => $node->getId(),
                'timestamp' => $now->format('c'),
            ]),
        ));

        $this->hub->publish(new Update(
            'admin/tasks',
            json_encode([
                'event' => 'task.updated',
                'task' => [
                    'id' => $task->getId(),
                    'type' => $task->getType(),
                    'status' => $task->getStatus(),
                    'worker' => $task->getWorker(),
                    'output' => $task->getOutput(),
                    'node' => $node ? [
                        'id' => $node->getId(),
                        'ipAddress' => $node->getIpAddress(),
                        'name' => $node->getName(),
                    ] : null,
                    'context' => $context ? [
                        'id' => $context->getId(),
                        'name' => $context->getName(),
                    ] : null,
                    'startedAt' => $task->getStartedAt()?->format('c'),
                    'completedAt' => $task->getCompletedAt()?->format('c'),
                    'createdAt' => $task->getCreatedAt()->format('c'),
                ],
            ]),
        ));
    }

    private function parseLatency(string $output): ?float
    {
        // Linux: "time=1.23 ms"
        if (preg_match('/time[=<]([\d.]+)\s*ms/i', $output, $m)) {
            return (float) $m[1];
        }
        return null;
    }
}

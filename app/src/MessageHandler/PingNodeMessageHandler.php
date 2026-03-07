<?php

namespace App\MessageHandler;

use App\Entity\Node;
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

        $node->setIsReachable($reachable);
        $node->setLastPingAt($now);

        $task->setStatus($reachable ? Task::STATUS_COMPLETED : Task::STATUS_FAILED);
        $task->setCompletedAt($now);
        $task->setOutput(trim($process->getOutput() . "\n" . $process->getErrorOutput()));

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
}

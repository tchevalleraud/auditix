<?php

namespace App\MessageHandler;

use App\Entity\MonitoringOid;
use App\Entity\Node;
use App\Entity\SnmpMonitoringData;
use App\Entity\Task;
use App\Message\SnmpPollNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Process\Process;

#[AsMessageHandler]
class SnmpPollNodeMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
    ) {}

    public function __invoke(SnmpPollNodeMessage $message): void
    {
        $node = $this->em->getRepository(Node::class)->find($message->getNodeId());
        if (!$node) {
            return;
        }

        $model = $node->getModel();
        if (!$model) {
            return;
        }

        $profile = $node->getProfile();
        $snmpCred = $profile?->getSnmpCredential();
        if (!$snmpCred) {
            return;
        }

        $oids = $this->em->getRepository(MonitoringOid::class)->findBy([
            'deviceModel' => $model,
            'enabled' => true,
        ]);

        if (empty($oids)) {
            return;
        }

        // Create task
        $task = $message->getTaskId()
            ? $this->em->getRepository(Task::class)->find($message->getTaskId())
            : null;

        if (!$task) {
            $task = new Task();
            $task->setType('snmp');
            $task->setNode($node);
            $task->setContext($node->getContext());
            $this->em->persist($task);
        }

        $serviceName = $_ENV['WORKER_SERVICE_NAME'] ?? 'worker';
        $hostname = gethostname() ?: 'unknown';
        $task->setWorker($serviceName . '/' . $hostname);
        $task->setStatus(Task::STATUS_RUNNING);
        $task->setStartedAt(new \DateTimeImmutable());
        $this->em->flush();

        $ip = $node->getIpAddress();
        $now = new \DateTimeImmutable();
        $output = [];
        $hasError = false;

        foreach ($oids as $monOid) {
            $cmd = $this->buildSnmpCommand($snmpCred, $ip, $monOid->getOid());
            $process = new Process($cmd);
            $process->setTimeout(10);
            $process->run();

            $result = trim($process->getOutput());
            $output[] = sprintf('[%s] OID %s: %s', $monOid->getCategory(), $monOid->getOid(), $result ?: $process->getErrorOutput());

            if ($process->isSuccessful() && $result) {
                $rawValue = $this->parseSnmpValue($result);
                $numericValue = $this->extractNumeric($rawValue);

                $data = new SnmpMonitoringData();
                $data->setNode($node);
                $data->setCategory($monOid->getCategory());
                $data->setOid($monOid->getOid());
                $data->setRawValue($rawValue);
                $data->setNumericValue($numericValue);
                $data->setRecordedAt($now);
                $this->em->persist($data);
            } else {
                $hasError = true;
            }
        }

        $task->setStatus($hasError ? Task::STATUS_FAILED : Task::STATUS_COMPLETED);
        $task->setCompletedAt(new \DateTimeImmutable());
        $task->setOutput(implode("\n", $output));
        $this->em->flush();

        // Publish Mercure updates
        $context = $node->getContext();

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
                    'node' => [
                        'id' => $node->getId(),
                        'ipAddress' => $node->getIpAddress(),
                        'name' => $node->getName(),
                    ],
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

    private function buildSnmpCommand($cred, string $ip, string $oid): array
    {
        $version = $cred->getVersion();

        if ($version === 'v1' || $version === 'v2c') {
            return ['snmpget', '-v', str_replace('v', '', $version), '-c', $cred->getCommunity() ?? 'public', $ip, $oid];
        }

        // SNMPv3
        $cmd = ['snmpget', '-v', '3', '-u', $cred->getUsername() ?? ''];

        $secLevel = $cred->getSecurityLevel() ?? 'noAuthNoPriv';
        $cmd[] = '-l';
        $cmd[] = $secLevel;

        if ($secLevel === 'authNoPriv' || $secLevel === 'authPriv') {
            $cmd[] = '-a';
            $cmd[] = $cred->getAuthProtocol() ?? 'SHA';
            $cmd[] = '-A';
            $cmd[] = $cred->getAuthPassword() ?? '';
        }

        if ($secLevel === 'authPriv') {
            $cmd[] = '-x';
            $cmd[] = $cred->getPrivProtocol() ?? 'AES';
            $cmd[] = '-X';
            $cmd[] = $cred->getPrivPassword() ?? '';
        }

        $cmd[] = $ip;
        $cmd[] = $oid;

        return $cmd;
    }

    private function parseSnmpValue(string $output): string
    {
        // snmpget output format: "OID = TYPE: VALUE"
        if (preg_match('/=\s*\S+:\s*(.+)$/m', $output, $m)) {
            return trim($m[1]);
        }
        // Fallback: try just after "="
        if (preg_match('/=\s*(.+)$/m', $output, $m)) {
            return trim($m[1]);
        }
        return trim($output);
    }

    private function extractNumeric(string $value): ?float
    {
        // Remove quotes
        $clean = trim($value, '"\'');
        // Try to extract a number
        if (preg_match('/^[-+]?\d*\.?\d+/', $clean, $m)) {
            return (float) $m[0];
        }
        return null;
    }
}

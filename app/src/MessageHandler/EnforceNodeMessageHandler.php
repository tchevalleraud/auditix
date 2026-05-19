<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Entity\ComplianceResult;
use App\Entity\EnforceResult;
use App\Entity\Node;
use App\Message\CollectNodeMessage;
use App\Message\EnforceNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use phpseclib3\Net\SSH2;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsMessageHandler]
class EnforceNodeMessageHandler
{
    private const SSH_TIMEOUT = 30;
    private const READ_TIMEOUT = 30;
    private const PROMPT_REGEX = '/[#>\$\]]\s*$/';
    private const STABLE_WAIT = 2;
    private const MAX_ATTEMPTS = 3;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        private readonly LoggerInterface $logger,
        private readonly MessageBusInterface $bus,
    ) {}

    private bool $anySuccess = false;

    public function __invoke(EnforceNodeMessage $message): void
    {
        $this->anySuccess = false;
        $node = $this->em->getRepository(Node::class)->find($message->getNodeId());
        if (!$node) {
            return;
        }

        if ($node->getPolicy() !== 'enforce') {
            $this->logger->info('[enforce] skipped — node policy is not enforce', [
                'nodeId' => $node->getId(),
                'policy' => $node->getPolicy(),
            ]);
            $node->setEnforcing(null);
            $this->em->flush();
            $this->publishNodeStatus($node);
            return;
        }

        $node->setEnforcing('running');
        $this->em->flush();
        $this->publishNodeStatus($node);

        $items = $this->resolveCliRecommendations($node);

        if (empty($items)) {
            $this->logger->info('[enforce] no CLI recommendations to apply', [
                'nodeId' => $node->getId(),
            ]);
            $node->setEnforcing(null);
            $this->em->flush();
            $this->publishNodeStatus($node);
            return;
        }

        $profile = $node->getProfile();
        $cliCred = $profile?->getCliCredential();

        if (!$cliCred || !$cliCred->getUsername()) {
            $this->recordSkip(
                $node,
                $items,
                'No CLI credentials configured on this node\'s profile',
            );
            $node->setEnforcing(null);
            $this->em->flush();
            $this->publishNodeStatus($node);
            return;
        }

        $ip = $node->getIpAddress();
        $port = $cliCred->getPort() ?: 22;
        $model = $node->getModel();

        try {
            $ssh = new SSH2($ip, $port, self::SSH_TIMEOUT);
            $ssh->enablePTY();

            if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) {
                $this->recordSkip(
                    $node,
                    $items,
                    'SSH authentication failed for ' . $cliCred->getUsername() . '@' . $ip . ':' . $port,
                );
                return;
            }

            $ssh->setTimeout(self::READ_TIMEOUT);
            $this->readFullResponse($ssh);
            $this->executeConnectionScript($ssh, $model?->getConnectionScript(), $model?->getSendCtrlChar());

            foreach ($items as $item) {
                /** @var ComplianceResult $cr */
                $cr = $item['result'];
                foreach ($item['commands'] as $line) {
                    $this->executeWithRetry($ssh, $node, $cr, $line);
                }
            }

            $ssh->disconnect();
        } catch (\Throwable $e) {
            $this->logger->error('[enforce] SSH error', [
                'nodeId' => $node->getId(),
                'error' => $e->getMessage(),
            ]);
        } finally {
            $node->setEnforcing(null);
            $this->em->flush();
            $this->publishNodeStatus($node);

            if ($this->anySuccess) {
                $this->dispatchPostEnforceCollect($node);
            }
        }
    }

    private function dispatchPostEnforceCollect(Node $node): void
    {
        $context = $node->getContext();
        if (!$context) {
            return;
        }

        $collection = new Collection();
        $collection->setNode($node);
        $collection->setContext($context);
        $collection->setPendingTags(['latest']);

        $this->em->persist($collection);
        $this->em->flush();

        $this->logger->info('[enforce] post-enforce collect dispatched', [
            'nodeId' => $node->getId(),
            'collectionId' => $collection->getId(),
        ]);

        $this->bus->dispatch(new CollectNodeMessage($collection->getId(), chainCompliance: true));
    }

    /**
     * @return array<int, array{result: ComplianceResult, commands: string[]}>
     */
    private function resolveCliRecommendations(Node $node): array
    {
        $results = $this->em->getRepository(ComplianceResult::class)->createQueryBuilder('r')
            ->where('r.node = :node')
            ->andWhere('r.status != :compliant')
            ->andWhere('r.recommendationType = :cli')
            ->andWhere('r.recommendation IS NOT NULL')
            ->setParameter('node', $node)
            ->setParameter('compliant', 'compliant')
            ->setParameter('cli', 'cli')
            ->orderBy('r.evaluatedAt', 'DESC')
            ->getQuery()
            ->getResult();

        $items = [];
        $seenRules = [];
        foreach ($results as $r) {
            /** @var ComplianceResult $r */
            $ruleId = $r->getRule()->getId();
            if (isset($seenRules[$ruleId])) {
                continue;
            }
            $seenRules[$ruleId] = true;

            $commands = array_values(array_filter(
                array_map('trim', explode("\n", (string) $r->getRecommendation())),
                fn(string $l) => $l !== '',
            ));
            if (empty($commands)) {
                continue;
            }
            $items[] = ['result' => $r, 'commands' => $commands];
        }
        return $items;
    }

    private function executeWithRetry(SSH2 $ssh, Node $node, ComplianceResult $cr, string $line): void
    {
        $attempt = 0;
        $lastError = null;
        $output = null;

        while ($attempt < self::MAX_ATTEMPTS) {
            $attempt++;
            try {
                $this->logger->info('[enforce] cmd start', [
                    'nodeId' => $node->getId(),
                    'attempt' => $attempt,
                    'cmd' => $line,
                ]);
                $ssh->write($line . "\n");
                $response = $this->readFullResponse($ssh);

                $responseLines = explode("\n", $response);
                if (!empty($responseLines) && str_contains($responseLines[0], trim($line))) {
                    array_shift($responseLines);
                }
                if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) {
                    array_pop($responseLines);
                }
                $output = implode("\n", $responseLines);

                $this->saveResult(
                    $node,
                    $cr,
                    $line,
                    $output,
                    EnforceResult::STATUS_SUCCESS,
                    $attempt,
                    null,
                );
                $this->anySuccess = true;
                return;
            } catch (\Throwable $e) {
                $lastError = $e->getMessage();
                $this->logger->warning('[enforce] cmd failed', [
                    'nodeId' => $node->getId(),
                    'attempt' => $attempt,
                    'cmd' => $line,
                    'error' => $lastError,
                ]);
            }
        }

        $this->saveResult(
            $node,
            $cr,
            $line,
            $output,
            EnforceResult::STATUS_FAILED,
            $attempt,
            $lastError,
        );
    }

    /**
     * @param array<int, array{result: ComplianceResult, commands: string[]}> $items
     */
    private function recordSkip(Node $node, array $items, string $reason): void
    {
        foreach ($items as $item) {
            foreach ($item['commands'] as $line) {
                $this->saveResult(
                    $node,
                    $item['result'],
                    $line,
                    null,
                    EnforceResult::STATUS_SKIPPED,
                    0,
                    $reason,
                );
            }
        }
    }

    private function saveResult(
        Node $node,
        ComplianceResult $cr,
        string $command,
        ?string $output,
        string $status,
        int $attempts,
        ?string $error,
    ): void {
        $entry = new EnforceResult();
        $entry->setNode($node);
        $entry->setPolicy($cr->getPolicy());
        $entry->setRule($cr->getRule());
        $entry->setCommand($command);
        $entry->setOutput($output);
        $entry->setStatus($status);
        $entry->setAttempts($attempts);
        $entry->setError($error);
        $this->em->persist($entry);
        $this->em->flush();

        $this->publishEnforceUpdate($entry);
    }

    private function publishEnforceUpdate(EnforceResult $entry): void
    {
        $node = $entry->getNode();
        $this->hub->publish(new Update(
            'enforce/node/' . $node->getId(),
            json_encode([
                'event' => 'enforce.updated',
                'result' => [
                    'id' => $entry->getId(),
                    'nodeId' => $node->getId(),
                    'ruleId' => $entry->getRule()?->getId(),
                    'policyId' => $entry->getPolicy()?->getId(),
                    'command' => $entry->getCommand(),
                    'status' => $entry->getStatus(),
                    'attempts' => $entry->getAttempts(),
                    'error' => $entry->getError(),
                    'executedAt' => $entry->getExecutedAt()->format('c'),
                ],
            ]),
        ));
    }

    private function publishNodeStatus(Node $node): void
    {
        $this->hub->publish(new Update(
            'enforce/node/' . $node->getId(),
            json_encode([
                'event' => 'enforce.node.status',
                'nodeId' => $node->getId(),
                'enforcing' => $node->getEnforcing(),
            ]),
        ));
    }

    private function readFullResponse(SSH2 $ssh): string
    {
        $output = $ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);

        $stableStart = microtime(true);
        $prevTimeout = self::READ_TIMEOUT;
        $ssh->setTimeout(self::STABLE_WAIT);

        while (true) {
            $extra = @$ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);
            if ($extra === false || $extra === '') {
                break;
            }
            $output .= $extra;
            $stableStart = microtime(true);

            if (microtime(true) - $stableStart > self::READ_TIMEOUT) {
                break;
            }
        }

        $ssh->setTimeout($prevTimeout);

        return $output;
    }

    private function executeConnectionScript(SSH2 $ssh, ?string $connectionScript, ?string $sendCtrlChar = null): void
    {
        if ($sendCtrlChar && preg_match('/^[A-Z]$/i', $sendCtrlChar)) {
            $ssh->write(chr(ord(strtoupper($sendCtrlChar)) - 64));
            $this->readFullResponse($ssh);
        }

        if (!$connectionScript) {
            return;
        }

        $scriptLines = array_filter(array_map('trim', explode("\n", $connectionScript)), fn($l) => $l !== '');
        foreach ($scriptLines as $line) {
            if (preg_match('/^\^([A-Za-z])$/', $line, $m)) {
                $char = strtoupper($m[1]);
                $controlChar = chr(ord($char) - 64);
                $ssh->write($controlChar);
            } else {
                $ssh->write($line . "\n");
            }
            $this->readFullResponse($ssh);
        }
    }
}

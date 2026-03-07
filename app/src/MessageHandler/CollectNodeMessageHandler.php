<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\Node;
use Doctrine\ORM\EntityManagerInterface;
use phpseclib3\Net\SSH2;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use App\Message\CollectNodeMessage;

#[AsMessageHandler]
class CollectNodeMessageHandler
{
    private const SSH_TIMEOUT = 30;
    private const READ_TIMEOUT = 30;
    private const PROMPT_REGEX = '/[#>\$\]]\s*$/';
    private const STABLE_WAIT = 2; // seconds to wait for more data after prompt detected

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    public function __invoke(CollectNodeMessage $message): void
    {
        $collection = $this->em->getRepository(Collection::class)->find($message->getCollectionId());
        if (!$collection) {
            return;
        }

        $node = $collection->getNode();
        $model = $node->getModel();

        $serviceName = $_ENV['WORKER_SERVICE_NAME'] ?? 'worker';
        $hostname = gethostname() ?: 'unknown';
        $collection->setWorker($serviceName . '/' . $hostname);
        $collection->setStatus(Collection::STATUS_RUNNING);
        $collection->setStartedAt(new \DateTimeImmutable());
        $this->em->flush();
        $this->publishUpdate($collection);

        $commands = $this->resolveCommands($model);

        if (empty($commands)) {
            $collection->setStatus(Collection::STATUS_COMPLETED);
            $collection->setCommandCount(0);
            $collection->setCompletedCount(0);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
            return;
        }

        $collection->setCommandCount(count($commands));
        $this->em->flush();
        $this->publishUpdate($collection);

        // Base storage directory for this collection
        $baseDir = $this->projectDir . '/var/' . $collection->getStoragePath();
        if (!is_dir($baseDir)) {
            mkdir($baseDir, 0775, true);
        }

        // Get CLI credentials
        $profile = $node->getProfile();
        $cliCred = $profile?->getCliCredential();

        if (!$cliCred || !$cliCred->getUsername()) {
            $collection->setStatus(Collection::STATUS_FAILED);
            $collection->setError('No CLI credentials configured on this node\'s profile');
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
            return;
        }

        $ip = $node->getIpAddress();
        $port = $cliCred->getPort() ?: 22;

        try {
            $ssh = new SSH2($ip, $port, self::SSH_TIMEOUT);
            $ssh->enablePTY();

            if (!$ssh->login($cliCred->getUsername(), $cliCred->getPassword() ?? '')) {
                $collection->setStatus(Collection::STATUS_FAILED);
                $collection->setError('SSH authentication failed for ' . $cliCred->getUsername() . '@' . $ip . ':' . $port);
                $collection->setCompletedAt(new \DateTimeImmutable());
                $this->em->flush();
                $this->publishUpdate($collection);
                return;
            }

            $ssh->setTimeout(self::READ_TIMEOUT);

            // Read initial prompt/banner
            $this->readFullResponse($ssh);

            // Execute connection script
            $connectionScript = $model?->getConnectionScript();
            if ($connectionScript) {
                $scriptLines = array_filter(array_map('trim', explode("\n", $connectionScript)), fn($l) => $l !== '');
                foreach ($scriptLines as $line) {
                    $ssh->write($line . "\n");
                    $this->readFullResponse($ssh);
                }
            }

            // Execute each collection command (rule)
            $completedCount = 0;
            $hasError = false;

            foreach ($commands as $cmd) {
                $ruleSlug = $cmd->getId() . '_' . $this->slugify($cmd->getName());
                $ruleDir = $baseDir . '/' . $ruleSlug;
                if (!is_dir($ruleDir)) {
                    mkdir($ruleDir, 0775, true);
                }

                try {
                    $cmdLines = array_filter(array_map('trim', explode("\n", $cmd->getCommands())), fn($l) => $l !== '');

                    foreach ($cmdLines as $line) {
                        $lineSlug = $this->slugify($line);
                        $filepath = $ruleDir . '/' . $lineSlug . '.txt';

                        $ssh->write($line . "\n");
                        $response = $this->readFullResponse($ssh);

                        // Remove the echoed command from the beginning of the response
                        $responseLines = explode("\n", $response);
                        if (!empty($responseLines) && str_contains($responseLines[0], trim($line))) {
                            array_shift($responseLines);
                        }
                        // Remove the trailing prompt line
                        if (!empty($responseLines) && preg_match(self::PROMPT_REGEX, end($responseLines))) {
                            array_pop($responseLines);
                        }

                        file_put_contents($filepath, implode("\n", $responseLines));
                    }

                    $completedCount++;
                } catch (\Throwable $e) {
                    $hasError = true;
                    file_put_contents($ruleDir . '/_error.txt', $e->getMessage());
                }

                $collection->setCompletedCount($completedCount);
                $this->em->flush();
                $this->publishUpdate($collection);
            }

            $ssh->disconnect();

            $collection->setStatus($hasError ? Collection::STATUS_FAILED : Collection::STATUS_COMPLETED);
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);

        } catch (\Throwable $e) {
            $collection->setStatus(Collection::STATUS_FAILED);
            $collection->setError('SSH error: ' . $e->getMessage());
            $collection->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->publishUpdate($collection);
        }
    }

    /**
     * Read the full response from the device, waiting until the output is
     * completely stable (no more data arriving) before returning.
     */
    private function readFullResponse(SSH2 $ssh): string
    {
        $output = '';
        $lastLength = -1;

        // Read until we detect a prompt
        $output = $ssh->read(self::PROMPT_REGEX, SSH2::READ_REGEX);

        // Wait and check if more data is still coming
        // (some devices send data in chunks even after a prompt-like line)
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

            // Safety: don't loop forever
            if (microtime(true) - $stableStart > self::READ_TIMEOUT) {
                break;
            }
        }

        $ssh->setTimeout($prevTimeout);

        return $output;
    }

    private function resolveCommands($model): array
    {
        if (!$model) {
            return [];
        }

        $commands = [];
        $seenIds = [];

        $manFolder = $this->em->getRepository(CollectionFolder::class)->findOneBy([
            'manufacturer' => $model->getManufacturer(),
            'model' => null,
            'type' => CollectionFolder::TYPE_MANUFACTURER,
        ]);
        if ($manFolder) {
            foreach ($this->em->getRepository(CollectionCommand::class)->findBy(['folder' => $manFolder, 'enabled' => true], ['name' => 'ASC']) as $c) {
                $commands[] = $c;
                $seenIds[] = $c->getId();
            }
        }

        $modelFolder = $this->em->getRepository(CollectionFolder::class)->findOneBy([
            'model' => $model,
            'type' => CollectionFolder::TYPE_MODEL,
        ]);
        if ($modelFolder) {
            foreach ($this->em->getRepository(CollectionCommand::class)->findBy(['folder' => $modelFolder, 'enabled' => true], ['name' => 'ASC']) as $c) {
                if (!in_array($c->getId(), $seenIds, true)) {
                    $commands[] = $c;
                    $seenIds[] = $c->getId();
                }
            }
        }

        foreach ($model->getManualCommands() as $c) {
            if ($c->isEnabled() && !in_array($c->getId(), $seenIds, true)) {
                $commands[] = $c;
                $seenIds[] = $c->getId();
            }
        }

        return $commands;
    }

    private function publishUpdate(Collection $collection): void
    {
        $node = $collection->getNode();
        $context = $collection->getContext();

        $this->hub->publish(new Update(
            'collections/node/' . $node->getId(),
            json_encode([
                'event' => 'collection.updated',
                'collection' => [
                    'id' => $collection->getId(),
                    'nodeId' => $node->getId(),
                    'status' => $collection->getStatus(),
                    'tags' => $collection->getTags(),
                    'commandCount' => $collection->getCommandCount(),
                    'completedCount' => $collection->getCompletedCount(),
                    'worker' => $collection->getWorker(),
                    'error' => $collection->getError(),
                    'startedAt' => $collection->getStartedAt()?->format('c'),
                    'completedAt' => $collection->getCompletedAt()?->format('c'),
                ],
            ]),
        ));

        $this->hub->publish(new Update(
            'admin/tasks',
            json_encode([
                'event' => 'task.updated',
                'task' => [
                    'id' => 'col-' . $collection->getId(),
                    'type' => 'collection',
                    'status' => $collection->getStatus(),
                    'worker' => $collection->getWorker(),
                    'output' => $collection->getError(),
                    'node' => [
                        'id' => $node->getId(),
                        'ipAddress' => $node->getIpAddress(),
                        'name' => $node->getName(),
                    ],
                    'context' => $context ? [
                        'id' => $context->getId(),
                        'name' => $context->getName(),
                    ] : null,
                    'startedAt' => $collection->getStartedAt()?->format('c'),
                    'completedAt' => $collection->getCompletedAt()?->format('c'),
                    'createdAt' => $collection->getCreatedAt()->format('c'),
                ],
            ]),
        ));
    }

    private function slugify(string $text): string
    {
        $text = preg_replace('/[^a-z0-9]+/i', '-', $text);
        return strtolower(trim($text, '-'));
    }
}

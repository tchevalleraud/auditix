<?php

namespace App\Service;

use App\Entity\AuditLog;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\RequestStack;

class AuditLogger
{
    public function __construct(
        private readonly ManagerRegistry $registry,
        private readonly SyslogForwarder $forwarder,
        private readonly RequestStack $requestStack,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * @param array<string,mixed> $context
     */
    public function log(
        string $level,
        string $category,
        string $action,
        string $message,
        ?string $actor = null,
        array $context = [],
        ?string $sourceIp = null,
    ): void {
        $resolvedIp = $sourceIp ?? $this->resolveSourceIp();

        try {
            $em = $this->getEntityManager();
            $entry = new AuditLog();
            $entry->setLevel($level);
            $entry->setCategory($category);
            $entry->setAction($action);
            $entry->setMessage($message);
            $entry->setActor($actor);
            $entry->setSourceIp($resolvedIp);
            $entry->setContext($context !== [] ? $context : null);

            $em->persist($entry);
            $em->flush();
            $em->detach($entry);
        } catch (\Throwable $e) {
            $this->logger->error('AuditLogger persist failed: {error}', ['error' => $e->getMessage()]);
        }

        try {
            $this->forwarder->broadcast($level, $category, $action, $message, array_merge($context, [
                'actor' => $actor,
                'source_ip' => $resolvedIp,
            ]));
        } catch (\Throwable $e) {
            $this->logger->warning('AuditLogger forward failed: {error}', ['error' => $e->getMessage()]);
        }
    }

    private function getEntityManager(): EntityManagerInterface
    {
        $em = $this->registry->getManager();
        if (!$em instanceof EntityManagerInterface) {
            throw new \RuntimeException('Default manager is not a Doctrine ORM EntityManager');
        }
        if (!$em->isOpen()) {
            $this->registry->resetManager();
            $em = $this->registry->getManager();
            if (!$em instanceof EntityManagerInterface) {
                throw new \RuntimeException('Reset manager is not a Doctrine ORM EntityManager');
            }
        }
        return $em;
    }

    private function resolveSourceIp(): ?string
    {
        $request = $this->requestStack->getCurrentRequest();
        return $request?->getClientIp();
    }
}

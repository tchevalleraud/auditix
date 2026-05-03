<?php

namespace App\Service;

use App\Entity\SyslogServer;
use App\Repository\SyslogServerRepository;
use Doctrine\ORM\EntityManagerInterface;

class SyslogServerService
{
    public function __construct(
        private readonly SyslogServerRepository $repository,
        private readonly EntityManagerInterface $em,
        private readonly SyslogForwarder $forwarder,
    ) {}

    /** @return list<SyslogServer> */
    public function listAll(): array
    {
        return $this->repository->findAllOrdered();
    }

    public function findById(int $id): ?SyslogServer
    {
        return $this->repository->find($id);
    }

    public function save(SyslogServer $server): void
    {
        $server->touch();
        if ($server->getId() === null) {
            $this->em->persist($server);
        }
        $this->em->flush();
        $this->forwarder->clearCache();
    }

    public function delete(SyslogServer $server): void
    {
        $this->em->remove($server);
        $this->em->flush();
        $this->forwarder->clearCache();
    }

    public function test(SyslogServer $server): void
    {
        if ($server->getHost() === null || $server->getHost() === '') {
            throw new \RuntimeException('Server host is required');
        }
        $this->forwarder->testServer(
            $server,
            sprintf('Auditix syslog test message for "%s"', $server->getName() ?? ''),
        );
    }
}

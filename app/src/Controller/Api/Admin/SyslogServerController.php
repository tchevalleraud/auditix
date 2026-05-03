<?php

namespace App\Controller\Api\Admin;

use App\Entity\SyslogServer;
use App\Service\SyslogServerService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/syslog')]
#[IsGranted('ROLE_ADMIN')]
class SyslogServerController extends AbstractController
{
    public function __construct(
        private readonly SyslogServerService $service,
    ) {}

    #[Route('/servers', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return $this->json(array_map($this->serialize(...), $this->service->listAll()));
    }

    #[Route('/servers', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        $name = trim((string) ($data['name'] ?? ''));
        $host = trim((string) ($data['host'] ?? ''));
        if ($name === '' || $host === '') {
            return $this->json(['error' => 'name and host are required'], Response::HTTP_BAD_REQUEST);
        }

        $server = new SyslogServer();
        $server->setName($name);
        $server->setHost($host);
        $this->applyData($server, $data);
        $this->service->save($server);

        return $this->json($this->serialize($server), Response::HTTP_CREATED);
    }

    #[Route('/servers/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function get(int $id): JsonResponse
    {
        $server = $this->service->findById($id);
        if ($server === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json($this->serialize($server));
    }

    #[Route('/servers/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $server = $this->service->findById($id);
        if ($server === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name !== '') {
                $server->setName($name);
            }
        }
        if (array_key_exists('host', $data)) {
            $host = trim((string) $data['host']);
            if ($host !== '') {
                $server->setHost($host);
            }
        }

        $this->applyData($server, $data);
        $this->service->save($server);

        return $this->json($this->serialize($server));
    }

    #[Route('/servers/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id): JsonResponse
    {
        $server = $this->service->findById($id);
        if ($server === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->service->delete($server);
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/servers/{id}/test', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function test(int $id): JsonResponse
    {
        $server = $this->service->findById($id);
        if ($server === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        try {
            $this->service->test($server);
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    private function serialize(SyslogServer $s): array
    {
        return [
            'id' => $s->getId(),
            'name' => $s->getName(),
            'host' => $s->getHost(),
            'port' => $s->getPort(),
            'protocol' => $s->getProtocol(),
            'minLevel' => $s->getMinLevel(),
            'facility' => $s->getFacility(),
            'appName' => $s->getAppName(),
            'enabled' => $s->isEnabled(),
            'updatedAt' => $s->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function applyData(SyslogServer $server, array $data): void
    {
        if (array_key_exists('port', $data)) {
            $port = (int) $data['port'];
            if ($port > 0 && $port <= 65535) {
                $server->setPort($port);
            }
        }
        if (array_key_exists('protocol', $data)) {
            $server->setProtocol((string) $data['protocol']);
        }
        if (array_key_exists('minLevel', $data)) {
            $server->setMinLevel((string) $data['minLevel']);
        }
        if (array_key_exists('facility', $data)) {
            $server->setFacility((int) $data['facility']);
        }
        if (array_key_exists('appName', $data)) {
            $server->setAppName((string) $data['appName']);
        }
        if (array_key_exists('enabled', $data)) {
            $server->setEnabled((bool) $data['enabled']);
        }
    }
}

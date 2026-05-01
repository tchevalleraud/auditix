<?php

namespace App\Controller\Api\Admin;

use App\Entity\MailServer;
use App\Service\MailServerService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/mail')]
#[IsGranted('ROLE_ADMIN')]
class MailServerController extends AbstractController
{
    private const SECRET_PLACEHOLDER = '••••••••';

    public function __construct(
        private readonly MailServerService $service,
    ) {
    }

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
        $fromEmail = trim((string) ($data['fromEmail'] ?? ''));
        if ($name === '' || $host === '' || $fromEmail === '') {
            return $this->json(['error' => 'name, host and fromEmail are required'], Response::HTTP_BAD_REQUEST);
        }
        if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            return $this->json(['error' => 'fromEmail is not a valid email'], Response::HTTP_BAD_REQUEST);
        }

        $server = new MailServer();
        $server->setName($name);
        $server->setHost($host);
        $server->setFromEmail($fromEmail);
        $this->applyData($server, $data);
        $this->service->save($server);

        if (array_key_exists('password', $data)) {
            $pwd = $data['password'];
            if (is_string($pwd) && $pwd !== '' && $pwd !== self::SECRET_PLACEHOLDER) {
                $this->service->setPassword($server, $pwd);
            }
        }

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
        if (array_key_exists('fromEmail', $data)) {
            $fromEmail = trim((string) $data['fromEmail']);
            if ($fromEmail !== '') {
                if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
                    return $this->json(['error' => 'fromEmail is not a valid email'], Response::HTTP_BAD_REQUEST);
                }
                $server->setFromEmail($fromEmail);
            }
        }

        $this->applyData($server, $data);
        $this->service->save($server);

        if (array_key_exists('password', $data)) {
            $pwd = $data['password'];
            if ($pwd === null || $pwd === '') {
                $this->service->setPassword($server, null);
            } elseif ($pwd !== self::SECRET_PLACEHOLDER) {
                $this->service->setPassword($server, (string) $pwd);
            }
        }

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
    public function test(int $id, Request $request): JsonResponse
    {
        $server = $this->service->findById($id);
        if ($server === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        $recipient = is_array($data) ? trim((string) ($data['recipient'] ?? '')) : '';
        if ($recipient === '') {
            return $this->json(['ok' => false, 'error' => 'recipient required'], Response::HTTP_BAD_REQUEST);
        }
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            return $this->json(['ok' => false, 'error' => 'recipient is not a valid email'], Response::HTTP_BAD_REQUEST);
        }
        try {
            $this->service->sendTest($server, $recipient);
            return $this->json(['ok' => true]);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    private function serialize(MailServer $s): array
    {
        return [
            'id' => $s->getId(),
            'name' => $s->getName(),
            'host' => $s->getHost(),
            'port' => $s->getPort(),
            'encryption' => $s->getEncryption(),
            'username' => $s->getUsername(),
            'password' => $s->getPasswordEncrypted() !== null ? self::SECRET_PLACEHOLDER : null,
            'fromEmail' => $s->getFromEmail(),
            'fromName' => $s->getFromName(),
            'enabled' => $s->isEnabled(),
            'addressingMode' => $s->getAddressingMode(),
            'updatedAt' => $s->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function applyData(MailServer $server, array $data): void
    {
        if (array_key_exists('port', $data)) {
            $port = (int) $data['port'];
            if ($port > 0 && $port <= 65535) {
                $server->setPort($port);
            }
        }
        if (array_key_exists('encryption', $data)) {
            $server->setEncryption((string) $data['encryption']);
        }
        if (array_key_exists('username', $data)) {
            $v = trim((string) ($data['username'] ?? ''));
            $server->setUsername($v === '' ? null : $v);
        }
        if (array_key_exists('fromName', $data)) {
            $v = trim((string) ($data['fromName'] ?? ''));
            $server->setFromName($v === '' ? null : $v);
        }
        if (array_key_exists('enabled', $data)) {
            $server->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('addressingMode', $data)) {
            $server->setAddressingMode((string) $data['addressingMode']);
        }
    }
}

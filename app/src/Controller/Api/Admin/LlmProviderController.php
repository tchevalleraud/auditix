<?php

namespace App\Controller\Api\Admin;

use App\Entity\LlmProvider;
use App\Service\LlmProviderService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/llm')]
#[IsGranted('ROLE_ADMIN')]
class LlmProviderController extends AbstractController
{
    private const SECRET_PLACEHOLDER = '••••••••';

    public function __construct(
        private readonly LlmProviderService $service,
    ) {
    }

    #[Route('/providers', methods: ['GET'])]
    public function list(): JsonResponse
    {
        return $this->json(array_map($this->serialize(...), $this->service->listAll()));
    }

    #[Route('/providers', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        $name = trim((string) ($data['name'] ?? ''));
        $type = trim((string) ($data['type'] ?? ''));
        if ($name === '' || !in_array($type, LlmProvider::TYPES, true)) {
            return $this->json(['error' => 'name and a valid type are required'], Response::HTTP_BAD_REQUEST);
        }

        $provider = new LlmProvider();
        $provider->setName($name);
        $provider->setType($type);
        $baseUrl = trim((string) ($data['baseUrl'] ?? ''));
        if ($baseUrl === '') {
            $baseUrl = LlmProviderService::defaultBaseUrlForType($type);
        }
        $provider->setBaseUrl($baseUrl);
        $this->applyData($provider, $data);
        $this->service->save($provider);

        if (array_key_exists('apiKey', $data)) {
            $key = $data['apiKey'];
            if (is_string($key) && $key !== '' && $key !== self::SECRET_PLACEHOLDER) {
                $this->service->setApiKey($provider, $key);
            }
        }

        return $this->json($this->serialize($provider), Response::HTTP_CREATED);
    }

    #[Route('/providers/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function get(int $id): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json($this->serialize($provider));
    }

    #[Route('/providers/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name !== '') {
                $provider->setName($name);
            }
        }
        if (array_key_exists('type', $data)) {
            $type = trim((string) $data['type']);
            if (in_array($type, LlmProvider::TYPES, true)) {
                $provider->setType($type);
            }
        }
        if (array_key_exists('baseUrl', $data)) {
            $baseUrl = trim((string) $data['baseUrl']);
            if ($baseUrl !== '') {
                $provider->setBaseUrl($baseUrl);
            }
        }
        $this->applyData($provider, $data);
        $this->service->save($provider);

        if (array_key_exists('apiKey', $data)) {
            $key = $data['apiKey'];
            if ($key === null || $key === '') {
                $this->service->setApiKey($provider, null);
            } elseif ($key !== self::SECRET_PLACEHOLDER) {
                $this->service->setApiKey($provider, (string) $key);
            }
        }

        return $this->json($this->serialize($provider));
    }

    #[Route('/providers/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->service->delete($provider);
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/providers/{id}/models', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function models(int $id): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        try {
            return $this->json($this->service->listModels($provider));
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    #[Route('/providers/{id}/test', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function test(int $id): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        try {
            $models = $this->service->listModels($provider);
            return $this->json(['ok' => true, 'modelCount' => count($models)]);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    private function serialize(LlmProvider $p): array
    {
        return [
            'id' => $p->getId(),
            'name' => $p->getName(),
            'type' => $p->getType(),
            'baseUrl' => $p->getBaseUrl(),
            'apiKey' => $p->getApiKeyEncrypted() !== null ? self::SECRET_PLACEHOLDER : null,
            'defaultModel' => $p->getDefaultModel(),
            'enabled' => $p->isEnabled(),
            'updatedAt' => $p->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function applyData(LlmProvider $provider, array $data): void
    {
        if (array_key_exists('defaultModel', $data)) {
            $v = trim((string) ($data['defaultModel'] ?? ''));
            $provider->setDefaultModel($v === '' ? null : $v);
        }
        if (array_key_exists('enabled', $data)) {
            $provider->setEnabled((bool) $data['enabled']);
        }
    }
}

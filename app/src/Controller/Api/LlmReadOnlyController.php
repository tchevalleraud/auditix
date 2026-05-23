<?php

namespace App\Controller\Api;

use App\Entity\LlmProvider;
use App\Service\LlmProviderService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Read-only LLM endpoints exposed to any authenticated user — used by
 * features like assisted extraction that let users pick a provider + model
 * for one-off prompts without needing the admin-only management endpoints.
 */
#[Route('/api/llm')]
#[IsGranted('IS_AUTHENTICATED_FULLY')]
class LlmReadOnlyController extends AbstractController
{
    public function __construct(
        private readonly LlmProviderService $service,
    ) {
    }

    #[Route('/providers', methods: ['GET'])]
    public function listProviders(): JsonResponse
    {
        $providers = $this->service->listEnabled();
        return $this->json(array_map(
            fn(LlmProvider $p) => [
                'id' => $p->getId(),
                'name' => $p->getName(),
                'type' => $p->getType(),
                'defaultModel' => $p->getDefaultModel(),
            ],
            $providers,
        ));
    }

    #[Route('/providers/{id}/models', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listModels(int $id): JsonResponse
    {
        $provider = $this->service->findById($id);
        if ($provider === null || !$provider->isEnabled()) {
            return $this->json(['error' => 'Provider not found'], Response::HTTP_NOT_FOUND);
        }
        try {
            return $this->json($this->service->listModels($provider));
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }
}

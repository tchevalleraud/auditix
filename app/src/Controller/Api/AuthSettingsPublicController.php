<?php

namespace App\Controller\Api;

use App\Repository\AuthSettingsRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

class AuthSettingsPublicController extends AbstractController
{
    public function __construct(
        private readonly AuthSettingsRepository $repository,
    ) {
    }

    #[Route('/api/auth/settings', name: 'api_auth_settings_public', methods: ['GET'])]
    public function get(): JsonResponse
    {
        $s = $this->repository->getSingleton();
        return $this->json([
            'passwordMinLength' => $s->getPasswordMinLength(),
            'passwordMaxLength' => $s->getPasswordMaxLength(),
            'passwordRequireUppercase' => $s->isPasswordRequireUppercase(),
            'passwordRequireLowercase' => $s->isPasswordRequireLowercase(),
            'passwordRequireDigit' => $s->isPasswordRequireDigit(),
            'passwordRequireSymbol' => $s->isPasswordRequireSymbol(),
            'idleTimeoutSeconds' => $s->getIdleTimeoutSeconds(),
        ]);
    }
}

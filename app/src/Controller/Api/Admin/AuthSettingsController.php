<?php

namespace App\Controller\Api\Admin;

use App\Repository\AuthSettingsRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/auth/settings')]
#[IsGranted('ROLE_ADMIN')]
class AuthSettingsController extends AbstractController
{
    public function __construct(
        private readonly AuthSettingsRepository $repository,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', methods: ['GET'])]
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
            'updatedAt' => $s->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ]);
    }

    #[Route('', methods: ['PUT'])]
    public function update(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $s = $this->repository->getSingleton();
        if (array_key_exists('passwordMinLength', $data)) {
            $s->setPasswordMinLength((int) $data['passwordMinLength']);
        }
        if (array_key_exists('passwordMaxLength', $data)) {
            $s->setPasswordMaxLength((int) $data['passwordMaxLength']);
        }
        if (array_key_exists('passwordRequireUppercase', $data)) {
            $s->setPasswordRequireUppercase((bool) $data['passwordRequireUppercase']);
        }
        if (array_key_exists('passwordRequireLowercase', $data)) {
            $s->setPasswordRequireLowercase((bool) $data['passwordRequireLowercase']);
        }
        if (array_key_exists('passwordRequireDigit', $data)) {
            $s->setPasswordRequireDigit((bool) $data['passwordRequireDigit']);
        }
        if (array_key_exists('passwordRequireSymbol', $data)) {
            $s->setPasswordRequireSymbol((bool) $data['passwordRequireSymbol']);
        }
        if (array_key_exists('idleTimeoutSeconds', $data)) {
            $s->setIdleTimeoutSeconds((int) $data['idleTimeoutSeconds']);
        }
        $s->touch();
        $this->em->flush();

        return $this->get();
    }
}

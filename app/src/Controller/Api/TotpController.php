<?php

namespace App\Controller\Api;

use App\Entity\User;
use App\Service\TotpService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/totp')]
class TotpController extends AbstractController
{
    public function __construct(
        private readonly TotpService $totp,
        private readonly EntityManagerInterface $em,
        private readonly UserPasswordHasherInterface $hasher,
    ) {}

    #[Route('/setup', name: 'api_totp_setup', methods: ['POST'])]
    public function setup(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if ($user->isTotpEnabled()) {
            return $this->json(['error' => 'TOTP already enabled'], Response::HTTP_CONFLICT);
        }

        $secret = $this->totp->generateSecret();
        $user->setTotpSecret($secret);
        $user->setTotpEnabled(false);
        $user->setTotpConfirmedAt(null);
        $user->setTotpBackupCodes(null);
        $this->em->flush();

        return $this->json([
            'secret' => $secret,
            'otpauthUri' => $this->totp->buildOtpAuthUri($user, $secret),
        ]);
    }

    #[Route('/enable', name: 'api_totp_enable', methods: ['POST'])]
    public function enable(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if ($user->isTotpEnabled()) {
            return $this->json(['error' => 'TOTP already enabled'], Response::HTTP_CONFLICT);
        }
        $secret = $user->getTotpSecret();
        if (!$secret) {
            return $this->json(['error' => 'TOTP setup not initialized'], Response::HTTP_BAD_REQUEST);
        }

        $data = json_decode($request->getContent(), true);
        $code = is_array($data) && isset($data['code']) ? (string) $data['code'] : '';

        if (!$this->totp->verifyCode($secret, $code)) {
            return $this->json(['error' => 'Invalid TOTP code'], Response::HTTP_BAD_REQUEST);
        }

        $codes = $this->totp->generateBackupCodes();
        $user->setTotpEnabled(true);
        $user->setTotpConfirmedAt(new \DateTimeImmutable());
        $user->setTotpBackupCodes($codes['hashed']);
        $this->em->flush();

        return $this->json([
            'enabled' => true,
            'backupCodes' => $codes['plaintext'],
        ]);
    }

    #[Route('/disable', name: 'api_totp_disable', methods: ['POST'])]
    public function disable(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if (!$user->isTotpEnabled()) {
            return $this->json(['error' => 'TOTP not enabled'], Response::HTTP_BAD_REQUEST);
        }

        $data = json_decode($request->getContent(), true);
        $password = is_array($data) && isset($data['password']) ? (string) $data['password'] : '';
        $code = is_array($data) && isset($data['code']) ? (string) $data['code'] : '';

        if ($password === '' || !$this->hasher->isPasswordValid($user, $password)) {
            return $this->json(['error' => 'Invalid password'], Response::HTTP_BAD_REQUEST);
        }

        $secret = $user->getTotpSecret() ?? '';
        $accepted = $this->totp->verifyCode($secret, $code);
        if (!$accepted) {
            $stored = $user->getTotpBackupCodes() ?? [];
            $remaining = $this->totp->consumeBackupCode($stored, $code);
            if ($remaining === null) {
                return $this->json(['error' => 'Invalid TOTP code'], Response::HTTP_BAD_REQUEST);
            }
        }

        $user->setTotpEnabled(false);
        $user->setTotpSecret(null);
        $user->setTotpBackupCodes(null);
        $user->setTotpConfirmedAt(null);
        $this->em->flush();

        return $this->json(['enabled' => false]);
    }

    #[Route('/backup-codes', name: 'api_totp_regen_backup_codes', methods: ['POST'])]
    public function regenerateBackupCodes(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if (!$user->isTotpEnabled()) {
            return $this->json(['error' => 'TOTP not enabled'], Response::HTTP_BAD_REQUEST);
        }

        $data = json_decode($request->getContent(), true);
        $code = is_array($data) && isset($data['code']) ? (string) $data['code'] : '';

        $secret = $user->getTotpSecret() ?? '';
        if (!$this->totp->verifyCode($secret, $code)) {
            return $this->json(['error' => 'Invalid TOTP code'], Response::HTTP_BAD_REQUEST);
        }

        $codes = $this->totp->generateBackupCodes();
        $user->setTotpBackupCodes($codes['hashed']);
        $this->em->flush();

        return $this->json(['backupCodes' => $codes['plaintext']]);
    }
}

<?php

namespace App\Controller\Api;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\String\Slugger\SluggerInterface;

#[Route('/api')]
class AuthController extends AbstractController
{
    #[Route('/login', name: 'api_login', methods: ['POST'])]
    public function login(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        return $this->json($this->serializeUser($user));
    }

    #[Route('/logout', name: 'api_logout', methods: ['POST'])]
    public function logout(): void
    {
    }

    #[Route('/me', name: 'api_me', methods: ['GET'])]
    public function me(): JsonResponse
    {
        /** @var User|null $user */
        $user = $this->getUser();

        if (!$user) {
            return $this->json(['error' => 'Not authenticated'], 401);
        }

        return $this->json($this->serializeUser($user));
    }

    #[Route('/profile', name: 'api_profile', methods: ['PUT'])]
    public function updateProfile(
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $passwordHasher,
    ): JsonResponse {
        /** @var User $user */
        $user = $this->getUser();
        $data = json_decode($request->getContent(), true);

        $user->setFirstName($data['firstName'] ?? $user->getFirstName());
        $user->setLastName($data['lastName'] ?? $user->getLastName());

        if (array_key_exists('locale', $data)) {
            $user->setLocale($data['locale']);
        }
        if (array_key_exists('theme', $data)) {
            $user->setTheme($data['theme']);
        }

        if (!empty($data['currentPassword']) && !empty($data['newPassword'])) {
            if (!$passwordHasher->isPasswordValid($user, $data['currentPassword'])) {
                return $this->json(
                    ['error' => 'Current password is incorrect'],
                    Response::HTTP_BAD_REQUEST,
                );
            }
            $user->setPassword($passwordHasher->hashPassword($user, $data['newPassword']));
        }

        $em->flush();

        return $this->json($this->serializeUser($user));
    }

    #[Route('/profile/avatar', name: 'api_profile_avatar', methods: ['POST'])]
    public function uploadAvatar(
        Request $request,
        EntityManagerInterface $em,
        SluggerInterface $slugger,
    ): JsonResponse {
        /** @var User $user */
        $user = $this->getUser();
        $file = $request->files->get('avatar');

        if (!$file) {
            return $this->json(['error' => 'No file uploaded'], Response::HTTP_BAD_REQUEST);
        }

        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!in_array($file->getMimeType(), $allowedMimes, true)) {
            return $this->json(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP'], Response::HTTP_BAD_REQUEST);
        }

        if ($file->getSize() > 2 * 1024 * 1024) {
            return $this->json(['error' => 'File too large. Max 2MB'], Response::HTTP_BAD_REQUEST);
        }

        $uploadDir = $this->getParameter('kernel.project_dir') . '/var/uploads/avatars';

        // Delete old avatar if exists
        if ($user->getAvatar()) {
            $oldFile = $uploadDir . '/' . $user->getAvatar();
            if (file_exists($oldFile)) {
                unlink($oldFile);
            }
        }

        $extension = $file->guessExtension() ?? 'jpg';
        $filename = $slugger->slug((string) $user->getId()) . '-' . uniqid() . '.' . $extension;

        $file->move($uploadDir, $filename);

        $user->setAvatar($filename);
        $em->flush();

        return $this->json($this->serializeUser($user));
    }

    #[Route('/profile/avatar', name: 'api_profile_avatar_delete', methods: ['DELETE'])]
    public function deleteAvatar(EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if ($user->getAvatar()) {
            $uploadDir = $this->getParameter('kernel.project_dir') . '/var/uploads/avatars';
            $oldFile = $uploadDir . '/' . $user->getAvatar();
            if (file_exists($oldFile)) {
                unlink($oldFile);
            }
            $user->setAvatar(null);
            $em->flush();
        }

        return $this->json($this->serializeUser($user));
    }

    #[Route('/profile/preferences', name: 'api_profile_preferences', methods: ['PATCH'])]
    public function patchPreferences(Request $request, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $current = $user->getPreferences() ?? [];
        $merged = array_merge($current, $data);
        $user->setPreferences($merged);
        $em->flush();

        return $this->json(['preferences' => $merged]);
    }

    private function serializeUser(User $user): array
    {
        return [
            'username' => $user->getUserIdentifier(),
            'firstName' => $user->getFirstName(),
            'lastName' => $user->getLastName(),
            'roles' => $user->getRoles(),
            'avatar' => $user->getAvatar() ? '/api/avatars/' . $user->getAvatar() : null,
            'locale' => $user->getLocale(),
            'theme' => $user->getTheme(),
            'preferences' => $user->getPreferences(),
        ];
    }
}

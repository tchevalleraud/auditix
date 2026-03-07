<?php

namespace App\Controller\Api;

use App\Entity\User;
use App\Repository\ContextRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/users')]
class UserController extends AbstractController
{
    private function serialize(User $u): array
    {
        return [
            'id' => $u->getId(),
            'username' => $u->getUsername(),
            'firstName' => $u->getFirstName(),
            'lastName' => $u->getLastName(),
            'roles' => $u->getRoles(),
            'avatar' => $u->getAvatar() ? '/api/avatars/' . $u->getAvatar() : null,
            'createdAt' => $u->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(UserRepository $repository): JsonResponse
    {
        $users = $repository->findBy([], ['username' => 'ASC']);

        return $this->json(array_map($this->serialize(...), $users));
    }

    #[Route('', methods: ['POST'])]
    public function create(
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $passwordHasher,
        UserRepository $repository,
        ContextRepository $contextRepository,
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);

        if (empty($data['username'])) {
            return $this->json(['error' => 'Username is required'], Response::HTTP_BAD_REQUEST);
        }

        if (empty($data['password'])) {
            return $this->json(['error' => 'Password is required'], Response::HTTP_BAD_REQUEST);
        }

        if ($repository->findOneBy(['username' => $data['username']])) {
            return $this->json(['error' => 'Username already exists'], Response::HTTP_CONFLICT);
        }

        $user = new User();
        $user->setUsername($data['username']);
        $user->setFirstName($data['firstName'] ?? null);
        $user->setLastName($data['lastName'] ?? null);
        $user->setRoles($data['roles'] ?? []);
        $user->setPassword($passwordHasher->hashPassword($user, $data['password']));

        $em->persist($user);

        // Auto-assign to Default context
        $defaultContext = $contextRepository->findOneBy(['isDefault' => true]);
        if ($defaultContext) {
            $defaultContext->addUser($user);
        }

        $em->flush();

        return $this->json($this->serialize($user), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(
        User $user,
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $passwordHasher,
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);

        $user->setFirstName($data['firstName'] ?? $user->getFirstName());
        $user->setLastName($data['lastName'] ?? $user->getLastName());

        if ($user->getUsername() !== 'admin') {
            if (!empty($data['username'])) {
                $user->setUsername($data['username']);
            }
            if (isset($data['roles'])) {
                $user->setRoles($data['roles']);
            }
        }

        if (!empty($data['password'])) {
            $user->setPassword($passwordHasher->hashPassword($user, $data['password']));
        }

        $em->flush();

        return $this->json($this->serialize($user));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(User $user, EntityManagerInterface $em): JsonResponse
    {
        if ($user->getUsername() === 'admin') {
            return $this->json(
                ['error' => 'The admin account cannot be deleted'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $em->remove($user);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

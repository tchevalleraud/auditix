<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\User;
use App\Repository\ContextRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/contexts')]
class ContextController extends AbstractController
{
    private function serialize(Context $c): array
    {
        return [
            'id' => $c->getId(),
            'name' => $c->getName(),
            'description' => $c->getDescription(),
            'monitoringEnabled' => $c->isMonitoringEnabled(),
            'snmpRetentionMinutes' => $c->getSnmpRetentionMinutes(),
            'snmpPollIntervalSeconds' => $c->getSnmpPollIntervalSeconds(),
            'icmpPollIntervalSeconds' => $c->getIcmpPollIntervalSeconds(),
            'isDefault' => $c->isDefault(),
            'publicEnabled' => $c->isPublicEnabled(),
            'publicToken' => $c->getPublicToken(),
            'userCount' => $c->getUsers()->count(),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    private function serializeUser(User $u): array
    {
        return [
            'id' => $u->getId(),
            'username' => $u->getUsername(),
            'firstName' => $u->getFirstName(),
            'lastName' => $u->getLastName(),
            'roles' => $u->getRoles(),
            'avatar' => $u->getAvatar() ? '/api/avatars/' . $u->getAvatar() : null,
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(ContextRepository $repository): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if ($this->isGranted('ROLE_ADMIN')) {
            $contexts = $repository->findBy([], ['name' => 'ASC']);
        } else {
            $contexts = $repository->findByUser($user);
        }

        return $this->json(array_map($this->serialize(...), $contexts));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Le nom est requis'], Response::HTTP_BAD_REQUEST);
        }

        $context = new Context();
        $context->setName($data['name']);
        $context->setDescription($data['description'] ?? null);
        $context->setMonitoringEnabled($data['monitoringEnabled'] ?? false);
        if (array_key_exists('snmpRetentionMinutes', $data)) {
            $context->setSnmpRetentionMinutes(max(1, (int) $data['snmpRetentionMinutes']));
        }
        if (array_key_exists('snmpPollIntervalSeconds', $data)) {
            $context->setSnmpPollIntervalSeconds(max(5, (int) $data['snmpPollIntervalSeconds']));
        }
        if (array_key_exists('icmpPollIntervalSeconds', $data)) {
            $context->setIcmpPollIntervalSeconds(max(5, (int) $data['icmpPollIntervalSeconds']));
        }

        $em->persist($context);
        $em->flush();

        return $this->json($this->serialize($context), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Context $context, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Le nom est requis'], Response::HTTP_BAD_REQUEST);
        }

        $context->setName($data['name']);
        $context->setDescription($data['description'] ?? null);
        $context->setMonitoringEnabled($data['monitoringEnabled'] ?? false);
        if (array_key_exists('snmpRetentionMinutes', $data)) {
            $context->setSnmpRetentionMinutes(max(1, (int) $data['snmpRetentionMinutes']));
        }
        if (array_key_exists('snmpPollIntervalSeconds', $data)) {
            $context->setSnmpPollIntervalSeconds(max(5, (int) $data['snmpPollIntervalSeconds']));
        }
        if (array_key_exists('icmpPollIntervalSeconds', $data)) {
            $context->setIcmpPollIntervalSeconds(max(5, (int) $data['icmpPollIntervalSeconds']));
        }
        if (array_key_exists('publicEnabled', $data)) {
            $context->setPublicEnabled((bool) $data['publicEnabled']);
            if ($data['publicEnabled'] && !$context->getPublicToken()) {
                $context->generatePublicToken();
            }
        }
        if (isset($data['regenerateToken']) && $data['regenerateToken']) {
            $context->generatePublicToken();
        }

        $em->flush();

        return $this->json($this->serialize($context));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Context $context, EntityManagerInterface $em): JsonResponse
    {
        if ($context->isDefault()) {
            return $this->json(
                ['error' => 'Le contexte par defaut ne peut pas etre supprime'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $em->remove($context);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/users', methods: ['GET'])]
    public function getUsers(Context $context): JsonResponse
    {
        if (!$this->isGranted('ROLE_ADMIN') && !$context->getUsers()->contains($this->getUser())) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        return $this->json(array_map(
            $this->serializeUser(...),
            $context->getUsers()->toArray(),
        ));
    }

    #[Route('/{id}/users', methods: ['PUT'])]
    public function setUsers(
        Context $context,
        Request $request,
        UserRepository $userRepository,
        EntityManagerInterface $em,
    ): JsonResponse {
        if (!$this->isGranted('ROLE_ADMIN') && !$context->getUsers()->contains($this->getUser())) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true);
        $userIds = $data['userIds'] ?? [];

        if ($context->isDefault()) {
            // Default context: can only add users, not remove existing ones
            foreach ($userIds as $userId) {
                $user = $userRepository->find($userId);
                if ($user) {
                    $context->addUser($user);
                }
            }
        } else {
            // Remove all current users
            foreach ($context->getUsers() as $user) {
                $context->removeUser($user);
            }

            // Add selected users
            foreach ($userIds as $userId) {
                $user = $userRepository->find($userId);
                if ($user) {
                    $context->addUser($user);
                }
            }
        }

        $em->flush();

        return $this->json(array_map(
            $this->serializeUser(...),
            $context->getUsers()->toArray(),
        ));
    }
}

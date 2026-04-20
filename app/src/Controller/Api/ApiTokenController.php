<?php

namespace App\Controller\Api;

use App\Entity\ApiToken;
use App\Entity\Context;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/api-tokens')]
class ApiTokenController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json([], Response::HTTP_BAD_REQUEST);
        }

        $tokens = $em->getRepository(ApiToken::class)->findBy(
            ['user' => $this->getUser(), 'context' => $contextId],
            ['createdAt' => 'DESC'],
        );

        return $this->json(array_map(fn(ApiToken $t) => [
            'id' => $t->getId(),
            'name' => $t->getName(),
            'tokenPrefix' => $t->getTokenPrefix(),
            'expiresAt' => $t->getExpiresAt()?->format('c'),
            'lastUsedAt' => $t->getLastUsedAt()?->format('c'),
            'createdAt' => $t->getCreatedAt()->format('c'),
            'expired' => $t->isExpired(),
        ], $tokens));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];
        $contextId = $request->query->getInt('context');

        $name = trim($data['name'] ?? '');
        if ($name === '') {
            return $this->json(['error' => 'Token name is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $expiresAt = null;
        if (!empty($data['expiresAt'])) {
            $expiresAt = new \DateTimeImmutable($data['expiresAt']);
        }

        [$token, $plaintext] = ApiToken::create($name, $this->getUser(), $context, $expiresAt);
        $em->persist($token);
        $em->flush();

        return $this->json([
            'id' => $token->getId(),
            'name' => $token->getName(),
            'tokenPrefix' => $token->getTokenPrefix(),
            'plaintext' => $plaintext,
            'expiresAt' => $token->getExpiresAt()?->format('c'),
            'createdAt' => $token->getCreatedAt()->format('c'),
        ], Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $token = $em->getRepository(ApiToken::class)->find($id);

        if (!$token || $token->getUser() !== $this->getUser()) {
            return $this->json(['error' => 'Token not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($token);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

<?php

namespace App\Controller\ApiV1;

use App\Entity\ApiToken;
use App\Entity\Context;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/auth')]
#[OA\Tag(name: 'Authentication')]
class AuthController extends AbstractController
{
    #[Route('/token', methods: ['POST'])]
    #[OA\Post(
        summary: 'Authenticate with username/password and get a temporary access token',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['username', 'password', 'contextId'],
                properties: [
                    new OA\Property(property: 'username', type: 'string'),
                    new OA\Property(property: 'password', type: 'string'),
                    new OA\Property(property: 'contextId', type: 'integer'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Access token returned'),
            new OA\Response(response: 401, description: 'Invalid credentials'),
        ],
    )]
    public function token(
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $hasher,
    ): JsonResponse {
        $data = json_decode($request->getContent(), true) ?? [];

        $username = $data['username'] ?? '';
        $password = $data['password'] ?? '';
        $contextId = $data['contextId'] ?? null;

        if ($username === '' || $password === '') {
            return $this->json(['error' => 'Username and password are required'], Response::HTTP_BAD_REQUEST);
        }

        $user = $em->getRepository(User::class)->findOneBy(['username' => $username]);
        if (!$user || !$hasher->isPasswordValid($user, $password)) {
            return $this->json(['error' => 'Invalid credentials'], Response::HTTP_UNAUTHORIZED);
        }

        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_BAD_REQUEST);
        }

        // Verify user has access to this context
        $hasAccess = false;
        foreach ($user->getContexts() as $ctx) {
            if ($ctx->getId() === $context->getId()) {
                $hasAccess = true;
                break;
            }
        }
        // Admins or users on default context always have access
        if (!$hasAccess && !in_array('ROLE_ADMIN', $user->getRoles()) && !$context->isDefault()) {
            return $this->json(['error' => 'Access denied to this context'], Response::HTTP_FORBIDDEN);
        }

        $expiresAt = new \DateTimeImmutable('+1 hour');
        [$token, $plaintext] = ApiToken::create('api-session', $user, $context, $expiresAt);

        $em->persist($token);
        $em->flush();

        return $this->json([
            'access_token' => $plaintext,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt->format('c'),
        ]);
    }
}

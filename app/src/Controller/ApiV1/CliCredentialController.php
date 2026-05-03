<?php

namespace App\Controller\ApiV1;

use App\Entity\CliCredential;
use App\Entity\Context;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/cli-credentials')]
#[OA\Tag(name: 'CLI Credentials')]
class CliCredentialController extends AbstractController
{
    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function serialize(CliCredential $c): array
    {
        return [
            'id' => $c->getId(),
            'name' => $c->getName(),
            'protocol' => $c->getProtocol(),
            'port' => $c->getPort(),
            'username' => $c->getUsername(),
            'password' => $c->getPassword(),
            'enablePassword' => $c->getEnablePassword(),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    private function findCredentialOrFail(int $id, EntityManagerInterface $em, Request $request): ?CliCredential
    {
        $c = $em->getRepository(CliCredential::class)->find($id);
        if (!$c || $c->getContext()?->getId() !== $this->getContext($request)->getId()) {
            return null;
        }
        return $c;
    }

    private function applyFields(CliCredential $c, array $data): void
    {
        if (array_key_exists('protocol', $data)) $c->setProtocol($data['protocol']);
        if (array_key_exists('port', $data)) $c->setPort($data['port'] !== null ? (int) $data['port'] : null);
        if (array_key_exists('username', $data)) $c->setUsername($data['username']);
        if (array_key_exists('password', $data)) $c->setPassword($data['password']);
        if (array_key_exists('enablePassword', $data)) $c->setEnablePassword($data['enablePassword']);
    }

    #[Route('', methods: ['GET'])]
    #[OA\Get(
        summary: 'List all CLI credentials in the token context',
        responses: [new OA\Response(response: 200, description: 'List of CLI credentials')],
    )]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $credentials = $em->getRepository(CliCredential::class)->findBy(
            ['context' => $this->getContext($request)],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $credentials));
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get a single CLI credential by ID',
        responses: [
            new OA\Response(response: 200, description: 'CLI credential details'),
            new OA\Response(response: 404, description: 'CLI credential not found'),
        ],
    )]
    public function show(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'CLI credential not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($c));
    }

    #[Route('', methods: ['POST'])]
    #[OA\Post(
        summary: 'Create a new CLI credential',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'protocol'],
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'protocol', type: 'string', enum: ['ssh', 'telnet']),
                    new OA\Property(property: 'port', type: 'integer', nullable: true),
                    new OA\Property(property: 'username', type: 'string', nullable: true),
                    new OA\Property(property: 'password', type: 'string', nullable: true),
                    new OA\Property(property: 'enablePassword', type: 'string', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'CLI credential created'),
            new OA\Response(response: 400, description: 'Validation error'),
        ],
    )]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

        $name = $data['name'] ?? '';
        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }
        if (empty($data['protocol'])) {
            return $this->json(['error' => 'Protocol is required'], Response::HTTP_BAD_REQUEST);
        }

        $c = new CliCredential();
        $c->setContext($context);
        $c->setName($name);
        $this->applyFields($c, $data);

        $em->persist($c);
        $em->flush();

        return $this->json($this->serialize($c), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[OA\Put(
        summary: 'Update an existing CLI credential',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'protocol', type: 'string', enum: ['ssh', 'telnet']),
                    new OA\Property(property: 'port', type: 'integer', nullable: true),
                    new OA\Property(property: 'username', type: 'string', nullable: true),
                    new OA\Property(property: 'password', type: 'string', nullable: true),
                    new OA\Property(property: 'enablePassword', type: 'string', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'CLI credential updated'),
            new OA\Response(response: 404, description: 'CLI credential not found'),
        ],
    )]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'CLI credential not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            if (empty($data['name'])) {
                return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
            }
            $c->setName($data['name']);
        }
        $this->applyFields($c, $data);

        $em->flush();

        return $this->json($this->serialize($c));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[OA\Delete(
        summary: 'Delete a CLI credential',
        responses: [
            new OA\Response(response: 204, description: 'CLI credential deleted'),
            new OA\Response(response: 404, description: 'CLI credential not found'),
        ],
    )]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'CLI credential not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($c);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

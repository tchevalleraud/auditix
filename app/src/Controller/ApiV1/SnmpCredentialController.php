<?php

namespace App\Controller\ApiV1;

use App\Entity\Context;
use App\Entity\SnmpCredential;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/snmp-credentials')]
#[OA\Tag(name: 'SNMP Credentials')]
class SnmpCredentialController extends AbstractController
{
    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function serialize(SnmpCredential $c): array
    {
        return [
            'id' => $c->getId(),
            'name' => $c->getName(),
            'version' => $c->getVersion(),
            'community' => $c->getCommunity(),
            'username' => $c->getUsername(),
            'securityLevel' => $c->getSecurityLevel(),
            'authProtocol' => $c->getAuthProtocol(),
            'authPassword' => $c->getAuthPassword(),
            'privProtocol' => $c->getPrivProtocol(),
            'privPassword' => $c->getPrivPassword(),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    private function findCredentialOrFail(int $id, EntityManagerInterface $em, Request $request): ?SnmpCredential
    {
        $c = $em->getRepository(SnmpCredential::class)->find($id);
        if (!$c || $c->getContext()?->getId() !== $this->getContext($request)->getId()) {
            return null;
        }
        return $c;
    }

    private function applyFields(SnmpCredential $c, array $data): void
    {
        if (array_key_exists('version', $data)) $c->setVersion($data['version']);
        if (array_key_exists('community', $data)) $c->setCommunity($data['community']);
        if (array_key_exists('username', $data)) $c->setUsername($data['username']);
        if (array_key_exists('securityLevel', $data)) $c->setSecurityLevel($data['securityLevel']);
        if (array_key_exists('authProtocol', $data)) $c->setAuthProtocol($data['authProtocol']);
        if (array_key_exists('authPassword', $data)) $c->setAuthPassword($data['authPassword']);
        if (array_key_exists('privProtocol', $data)) $c->setPrivProtocol($data['privProtocol']);
        if (array_key_exists('privPassword', $data)) $c->setPrivPassword($data['privPassword']);
    }

    #[Route('', methods: ['GET'])]
    #[OA\Get(
        summary: 'List all SNMP credentials in the token context',
        responses: [new OA\Response(response: 200, description: 'List of SNMP credentials')],
    )]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $credentials = $em->getRepository(SnmpCredential::class)->findBy(
            ['context' => $this->getContext($request)],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $credentials));
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get a single SNMP credential by ID',
        responses: [
            new OA\Response(response: 200, description: 'SNMP credential details'),
            new OA\Response(response: 404, description: 'SNMP credential not found'),
        ],
    )]
    public function show(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'SNMP credential not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($c));
    }

    #[Route('', methods: ['POST'])]
    #[OA\Post(
        summary: 'Create a new SNMP credential',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name', 'version'],
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'version', type: 'string', enum: ['v1', 'v2c', 'v3']),
                    new OA\Property(property: 'community', type: 'string', nullable: true, description: 'Required for v1/v2c'),
                    new OA\Property(property: 'username', type: 'string', nullable: true, description: 'Required for v3'),
                    new OA\Property(property: 'securityLevel', type: 'string', nullable: true, enum: ['noAuthNoPriv', 'authNoPriv', 'authPriv']),
                    new OA\Property(property: 'authProtocol', type: 'string', nullable: true, enum: ['MD5', 'SHA']),
                    new OA\Property(property: 'authPassword', type: 'string', nullable: true),
                    new OA\Property(property: 'privProtocol', type: 'string', nullable: true, enum: ['DES', 'AES']),
                    new OA\Property(property: 'privPassword', type: 'string', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'SNMP credential created'),
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
        if (empty($data['version'])) {
            return $this->json(['error' => 'Version is required'], Response::HTTP_BAD_REQUEST);
        }

        $c = new SnmpCredential();
        $c->setContext($context);
        $c->setName($name);
        $this->applyFields($c, $data);

        $em->persist($c);
        $em->flush();

        return $this->json($this->serialize($c), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[OA\Put(
        summary: 'Update an existing SNMP credential',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'version', type: 'string', enum: ['v1', 'v2c', 'v3']),
                    new OA\Property(property: 'community', type: 'string', nullable: true),
                    new OA\Property(property: 'username', type: 'string', nullable: true),
                    new OA\Property(property: 'securityLevel', type: 'string', nullable: true),
                    new OA\Property(property: 'authProtocol', type: 'string', nullable: true),
                    new OA\Property(property: 'authPassword', type: 'string', nullable: true),
                    new OA\Property(property: 'privProtocol', type: 'string', nullable: true),
                    new OA\Property(property: 'privPassword', type: 'string', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'SNMP credential updated'),
            new OA\Response(response: 404, description: 'SNMP credential not found'),
        ],
    )]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'SNMP credential not found'], Response::HTTP_NOT_FOUND);
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
        summary: 'Delete an SNMP credential',
        responses: [
            new OA\Response(response: 204, description: 'SNMP credential deleted'),
            new OA\Response(response: 404, description: 'SNMP credential not found'),
        ],
    )]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $c = $this->findCredentialOrFail($id, $em, $request);
        if (!$c) {
            return $this->json(['error' => 'SNMP credential not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($c);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

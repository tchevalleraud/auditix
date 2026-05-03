<?php

namespace App\Controller\ApiV1;

use App\Entity\CliCredential;
use App\Entity\Context;
use App\Entity\Profile;
use App\Entity\SnmpCredential;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/profiles')]
#[OA\Tag(name: 'Profiles')]
class ProfileController extends AbstractController
{
    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function serialize(Profile $p): array
    {
        $snmp = $p->getSnmpCredential();
        $cli = $p->getCliCredential();

        return [
            'id' => $p->getId(),
            'name' => $p->getName(),
            'snmpCredential' => $snmp ? [
                'id' => $snmp->getId(),
                'name' => $snmp->getName(),
                'version' => $snmp->getVersion(),
            ] : null,
            'cliCredential' => $cli ? [
                'id' => $cli->getId(),
                'name' => $cli->getName(),
                'protocol' => $cli->getProtocol(),
                'port' => $cli->getPort(),
            ] : null,
            'createdAt' => $p->getCreatedAt()->format('c'),
        ];
    }

    private function findProfileOrFail(int $id, EntityManagerInterface $em, Request $request): ?Profile
    {
        $profile = $em->getRepository(Profile::class)->find($id);
        if (!$profile || $profile->getContext()?->getId() !== $this->getContext($request)->getId()) {
            return null;
        }
        return $profile;
    }

    private function resolveSnmpCredential(int $id, EntityManagerInterface $em, Context $context): ?SnmpCredential
    {
        $snmp = $em->getRepository(SnmpCredential::class)->find($id);
        if (!$snmp || $snmp->getContext()?->getId() !== $context->getId()) {
            return null;
        }
        return $snmp;
    }

    private function resolveCliCredential(int $id, EntityManagerInterface $em, Context $context): ?CliCredential
    {
        $cli = $em->getRepository(CliCredential::class)->find($id);
        if (!$cli || $cli->getContext()?->getId() !== $context->getId()) {
            return null;
        }
        return $cli;
    }

    #[Route('', methods: ['GET'])]
    #[OA\Get(
        summary: 'List all profiles in the token context',
        responses: [new OA\Response(response: 200, description: 'List of profiles')],
    )]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $profiles = $em->getRepository(Profile::class)->findBy(
            ['context' => $this->getContext($request)],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $profiles));
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get a single profile by ID',
        responses: [
            new OA\Response(response: 200, description: 'Profile details'),
            new OA\Response(response: 404, description: 'Profile not found'),
        ],
    )]
    public function show(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $profile = $this->findProfileOrFail($id, $em, $request);
        if (!$profile) {
            return $this->json(['error' => 'Profile not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($profile));
    }

    #[Route('', methods: ['POST'])]
    #[OA\Post(
        summary: 'Create a new profile',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name'],
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'snmpCredentialId', type: 'integer', nullable: true),
                    new OA\Property(property: 'cliCredentialId', type: 'integer', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'Profile created'),
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

        $profile = new Profile();
        $profile->setContext($context);
        $profile->setName($name);

        if (!empty($data['snmpCredentialId'])) {
            $snmp = $this->resolveSnmpCredential((int) $data['snmpCredentialId'], $em, $context);
            if (!$snmp) {
                return $this->json(['error' => 'SNMP credential not found'], Response::HTTP_BAD_REQUEST);
            }
            $profile->setSnmpCredential($snmp);
        }
        if (!empty($data['cliCredentialId'])) {
            $cli = $this->resolveCliCredential((int) $data['cliCredentialId'], $em, $context);
            if (!$cli) {
                return $this->json(['error' => 'CLI credential not found'], Response::HTTP_BAD_REQUEST);
            }
            $profile->setCliCredential($cli);
        }

        $em->persist($profile);
        $em->flush();

        return $this->json($this->serialize($profile), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[OA\Put(
        summary: 'Update an existing profile',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'snmpCredentialId', type: 'integer', nullable: true),
                    new OA\Property(property: 'cliCredentialId', type: 'integer', nullable: true),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Profile updated'),
            new OA\Response(response: 404, description: 'Profile not found'),
        ],
    )]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $profile = $this->findProfileOrFail($id, $em, $request);
        if (!$profile) {
            return $this->json(['error' => 'Profile not found'], Response::HTTP_NOT_FOUND);
        }

        $context = $this->getContext($request);
        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            if (empty($data['name'])) {
                return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
            }
            $profile->setName($data['name']);
        }

        if (array_key_exists('snmpCredentialId', $data)) {
            if ($data['snmpCredentialId']) {
                $snmp = $this->resolveSnmpCredential((int) $data['snmpCredentialId'], $em, $context);
                if (!$snmp) {
                    return $this->json(['error' => 'SNMP credential not found'], Response::HTTP_BAD_REQUEST);
                }
                $profile->setSnmpCredential($snmp);
            } else {
                $profile->setSnmpCredential(null);
            }
        }

        if (array_key_exists('cliCredentialId', $data)) {
            if ($data['cliCredentialId']) {
                $cli = $this->resolveCliCredential((int) $data['cliCredentialId'], $em, $context);
                if (!$cli) {
                    return $this->json(['error' => 'CLI credential not found'], Response::HTTP_BAD_REQUEST);
                }
                $profile->setCliCredential($cli);
            } else {
                $profile->setCliCredential(null);
            }
        }

        $em->flush();

        return $this->json($this->serialize($profile));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[OA\Delete(
        summary: 'Delete a profile',
        responses: [
            new OA\Response(response: 204, description: 'Profile deleted'),
            new OA\Response(response: 404, description: 'Profile not found'),
        ],
    )]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $profile = $this->findProfileOrFail($id, $em, $request);
        if (!$profile) {
            return $this->json(['error' => 'Profile not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($profile);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

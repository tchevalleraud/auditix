<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\SnmpCredential;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/snmp-credentials')]
class SnmpCredentialController extends AbstractController
{
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

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $credentials = $em->getRepository(SnmpCredential::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $credentials));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $name = $data['name'] ?? '';
        if (empty($name)) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $c = new SnmpCredential();
        $c->setContext($context);
        $c->setName($name);
        $c->setVersion($data['version'] ?? null);
        $c->setCommunity($data['community'] ?? null);
        $c->setUsername($data['username'] ?? null);
        $c->setSecurityLevel($data['securityLevel'] ?? null);
        $c->setAuthProtocol($data['authProtocol'] ?? null);
        $c->setAuthPassword($data['authPassword'] ?? null);
        $c->setPrivProtocol($data['privProtocol'] ?? null);
        $c->setPrivPassword($data['privPassword'] ?? null);

        $em->persist($c);
        $em->flush();

        return $this->json($this->serialize($c), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(SnmpCredential $credential, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $name = $data['name'] ?? '';
        if (empty($name)) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $credential->setName($name);
        $credential->setVersion($data['version'] ?? null);
        $credential->setCommunity($data['community'] ?? null);
        $credential->setUsername($data['username'] ?? null);
        $credential->setSecurityLevel($data['securityLevel'] ?? null);
        $credential->setAuthProtocol($data['authProtocol'] ?? null);
        $credential->setAuthPassword($data['authPassword'] ?? null);
        $credential->setPrivProtocol($data['privProtocol'] ?? null);
        $credential->setPrivPassword($data['privPassword'] ?? null);

        $em->flush();

        return $this->json($this->serialize($credential));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(SnmpCredential $credential, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($credential);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

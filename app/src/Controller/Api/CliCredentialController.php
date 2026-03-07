<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\CliCredential;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/cli-credentials')]
class CliCredentialController extends AbstractController
{
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

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $credentials = $em->getRepository(CliCredential::class)->findBy(
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

        $c = new CliCredential();
        $c->setContext($context);
        $c->setName($name);
        $c->setProtocol($data['protocol'] ?? null);
        $c->setPort(isset($data['port']) ? (int)$data['port'] : null);
        $c->setUsername($data['username'] ?? null);
        $c->setPassword($data['password'] ?? null);
        $c->setEnablePassword($data['enablePassword'] ?? null);

        $em->persist($c);
        $em->flush();

        return $this->json($this->serialize($c), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(CliCredential $credential, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $name = $data['name'] ?? '';
        if (empty($name)) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $credential->setName($name);
        $credential->setProtocol($data['protocol'] ?? null);
        $credential->setPort(isset($data['port']) ? (int)$data['port'] : null);
        $credential->setUsername($data['username'] ?? null);
        $credential->setPassword($data['password'] ?? null);
        $credential->setEnablePassword($data['enablePassword'] ?? null);

        $em->flush();

        return $this->json($this->serialize($credential));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(CliCredential $credential, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($credential);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

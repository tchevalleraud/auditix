<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeTag;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/node-tags')]
class NodeTagController extends AbstractController
{
    private function serialize(NodeTag $t): array
    {
        return [
            'id' => $t->getId(),
            'name' => $t->getName(),
            'color' => $t->getColor(),
            'createdAt' => $t->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $tags = $em->getRepository(NodeTag::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $tags));
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

        $tag = new NodeTag();
        $tag->setName($name);
        $tag->setColor($data['color'] ?? '#6b7280');
        $tag->setContext($context);

        $em->persist($tag);
        $em->flush();

        return $this->json($this->serialize($tag), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(NodeTag $tag, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (array_key_exists('name', $data)) {
            if (empty($data['name'])) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
            $tag->setName($data['name']);
        }
        if (array_key_exists('color', $data)) {
            $tag->setColor($data['color']);
        }

        $em->flush();

        return $this->json($this->serialize($tag));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(NodeTag $tag, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($tag);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

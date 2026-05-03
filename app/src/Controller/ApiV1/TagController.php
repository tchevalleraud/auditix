<?php

namespace App\Controller\ApiV1;

use App\Entity\Context;
use App\Entity\NodeTag;
use Doctrine\ORM\EntityManagerInterface;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/v1/tags')]
#[OA\Tag(name: 'Tags')]
class TagController extends AbstractController
{
    private function getContext(Request $request): Context
    {
        return $request->attributes->get('_api_context');
    }

    private function serialize(NodeTag $t): array
    {
        return [
            'id' => $t->getId(),
            'name' => $t->getName(),
            'color' => $t->getColor(),
            'createdAt' => $t->getCreatedAt()->format('c'),
        ];
    }

    private function findTagOrFail(int $id, EntityManagerInterface $em, Request $request): ?NodeTag
    {
        $tag = $em->getRepository(NodeTag::class)->find($id);
        if (!$tag || $tag->getContext()?->getId() !== $this->getContext($request)->getId()) {
            return null;
        }
        return $tag;
    }

    #[Route('', methods: ['GET'])]
    #[OA\Get(
        summary: 'List all tags in the token context',
        responses: [new OA\Response(response: 200, description: 'List of tags')],
    )]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $tags = $em->getRepository(NodeTag::class)->findBy(
            ['context' => $this->getContext($request)],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $tags));
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[OA\Get(
        summary: 'Get a single tag by ID',
        responses: [
            new OA\Response(response: 200, description: 'Tag details'),
            new OA\Response(response: 404, description: 'Tag not found'),
        ],
    )]
    public function show(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $tag = $this->findTagOrFail($id, $em, $request);
        if (!$tag) {
            return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);
        }

        return $this->json($this->serialize($tag));
    }

    #[Route('', methods: ['POST'])]
    #[OA\Post(
        summary: 'Create a new tag',
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name'],
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'color', type: 'string', example: '#6b7280', description: 'Hex color (e.g. #6b7280)'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 201, description: 'Tag created'),
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

        $tag = new NodeTag();
        $tag->setContext($context);
        $tag->setName($name);
        $tag->setColor($data['color'] ?? '#6b7280');

        $em->persist($tag);
        $em->flush();

        return $this->json($this->serialize($tag), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[OA\Put(
        summary: 'Update an existing tag',
        requestBody: new OA\RequestBody(
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'color', type: 'string'),
                ],
            ),
        ),
        responses: [
            new OA\Response(response: 200, description: 'Tag updated'),
            new OA\Response(response: 404, description: 'Tag not found'),
        ],
    )]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $tag = $this->findTagOrFail($id, $em, $request);
        if (!$tag) {
            return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            if (empty($data['name'])) {
                return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
            }
            $tag->setName($data['name']);
        }
        if (array_key_exists('color', $data)) {
            $tag->setColor($data['color']);
        }

        $em->flush();

        return $this->json($this->serialize($tag));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[OA\Delete(
        summary: 'Delete a tag',
        responses: [
            new OA\Response(response: 204, description: 'Tag deleted'),
            new OA\Response(response: 404, description: 'Tag not found'),
        ],
    )]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $tag = $this->findTagOrFail($id, $em, $request);
        if (!$tag) {
            return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($tag);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

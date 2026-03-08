<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\InventoryCategory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/inventory-categories')]
class InventoryCategoryController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json([]);
        }

        $categories = $em->getRepository(InventoryCategory::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map(fn(InventoryCategory $c) => [
            'id' => $c->getId(),
            'name' => $c->getName(),
            'keyLabel' => $c->getKeyLabel(),
        ], $categories));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;

        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $name = $data['name'] ?? '';
        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $cat = new InventoryCategory();
        $cat->setName($name);
        $cat->setContext($context);
        if (isset($data['keyLabel'])) {
            $cat->setKeyLabel($data['keyLabel']);
        }

        $em->persist($cat);
        $em->flush();

        return $this->json([
            'id' => $cat->getId(),
            'name' => $cat->getName(),
            'keyLabel' => $cat->getKeyLabel(),
        ], Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(InventoryCategory $cat, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (isset($data['name'])) {
            $cat->setName($data['name']);
        }
        if (array_key_exists('keyLabel', $data)) {
            $cat->setKeyLabel($data['keyLabel']);
        }
        $em->flush();

        return $this->json([
            'id' => $cat->getId(),
            'name' => $cat->getName(),
            'keyLabel' => $cat->getKeyLabel(),
        ]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(InventoryCategory $cat, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($cat);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Editor;
use App\Entity\ProductRange;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/product-ranges')]
class ProductRangeController extends AbstractController
{
    private function serialize(ProductRange $pr): array
    {
        return [
            'id' => $pr->getId(),
            'name' => $pr->getName(),
            'description' => $pr->getDescription(),
            'manufacturer' => $pr->getManufacturer() ? [
                'id' => $pr->getManufacturer()->getId(),
                'name' => $pr->getManufacturer()->getName(),
            ] : null,
            'recommendedVersion' => $pr->getRecommendedVersion(),
            'currentVersion' => $pr->getCurrentVersion(),
            'releaseDate' => $pr->getReleaseDate()?->format('c'),
            'endOfSaleDate' => $pr->getEndOfSaleDate()?->format('c'),
            'endOfSupportDate' => $pr->getEndOfSupportDate()?->format('c'),
            'endOfLifeDate' => $pr->getEndOfLifeDate()?->format('c'),
            'pluginSource' => $pr->getPluginSource(),
            'lastSyncedAt' => $pr->getLastSyncedAt()?->format('c'),
            'createdAt' => $pr->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $ranges = $em->getRepository(ProductRange::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map(fn($pr) => $this->serialize($pr), $ranges));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }
        if (empty($data['manufacturerId'])) {
            return $this->json(['error' => 'Manufacturer is required'], Response::HTTP_BAD_REQUEST);
        }

        $manufacturer = $em->getRepository(Editor::class)->find($data['manufacturerId']);
        if (!$manufacturer) return $this->json(['error' => 'Manufacturer not found'], Response::HTTP_NOT_FOUND);

        $range = new ProductRange();
        $range->setName($data['name']);
        $range->setDescription($data['description'] ?? null);
        $range->setManufacturer($manufacturer);
        $range->setContext($context);
        $range->setRecommendedVersion($data['recommendedVersion'] ?? null);
        $range->setCurrentVersion($data['currentVersion'] ?? null);

        if (!empty($data['releaseDate'])) $range->setReleaseDate(new \DateTimeImmutable($data['releaseDate']));
        if (!empty($data['endOfSaleDate'])) $range->setEndOfSaleDate(new \DateTimeImmutable($data['endOfSaleDate']));
        if (!empty($data['endOfSupportDate'])) $range->setEndOfSupportDate(new \DateTimeImmutable($data['endOfSupportDate']));
        if (!empty($data['endOfLifeDate'])) $range->setEndOfLifeDate(new \DateTimeImmutable($data['endOfLifeDate']));

        $em->persist($range);
        $em->flush();

        return $this->json($this->serialize($range), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(ProductRange $range, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $range->setName($data['name']);
        if (array_key_exists('description', $data)) $range->setDescription($data['description']);
        if (array_key_exists('recommendedVersion', $data)) $range->setRecommendedVersion($data['recommendedVersion'] ?: null);
        if (array_key_exists('currentVersion', $data)) $range->setCurrentVersion($data['currentVersion'] ?: null);

        if (array_key_exists('releaseDate', $data)) {
            $range->setReleaseDate($data['releaseDate'] ? new \DateTimeImmutable($data['releaseDate']) : null);
        }
        if (array_key_exists('endOfSaleDate', $data)) {
            $range->setEndOfSaleDate($data['endOfSaleDate'] ? new \DateTimeImmutable($data['endOfSaleDate']) : null);
        }
        if (array_key_exists('endOfSupportDate', $data)) {
            $range->setEndOfSupportDate($data['endOfSupportDate'] ? new \DateTimeImmutable($data['endOfSupportDate']) : null);
        }
        if (array_key_exists('endOfLifeDate', $data)) {
            $range->setEndOfLifeDate($data['endOfLifeDate'] ? new \DateTimeImmutable($data['endOfLifeDate']) : null);
        }

        if (!empty($data['manufacturerId'])) {
            $manufacturer = $em->getRepository(Editor::class)->find($data['manufacturerId']);
            if ($manufacturer) $range->setManufacturer($manufacturer);
        }

        $em->flush();

        return $this->json($this->serialize($range));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(ProductRange $range, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($range);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

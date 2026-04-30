<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\InventoryCategory;
use App\Entity\NodeInventoryEntry;
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

        $rows = $em->createQueryBuilder()
            ->select('c.id', 'c.name', 'c.keyLabel', 'c.createdAt', 'COUNT(DISTINCT e.id) AS usageCount')
            ->from(InventoryCategory::class, 'c')
            ->leftJoin(NodeInventoryEntry::class, 'e', 'WITH', 'e.category = c')
            ->where('c.context = :ctx')
            ->setParameter('ctx', $contextId)
            ->groupBy('c.id')
            ->orderBy('c.name', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return $this->json(array_map(fn(array $r) => [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'keyLabel' => $r['keyLabel'],
            'createdAt' => $r['createdAt'] instanceof \DateTimeInterface ? $r['createdAt']->format(\DateTimeInterface::ATOM) : null,
            'usageCount' => (int)$r['usageCount'],
        ], $rows));
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
            'createdAt' => $cat->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'usageCount' => 0,
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

        $usageCount = (int)$em->createQueryBuilder()
            ->select('COUNT(e.id)')
            ->from(NodeInventoryEntry::class, 'e')
            ->where('e.category = :cat')
            ->setParameter('cat', $cat)
            ->getQuery()
            ->getSingleScalarResult();

        return $this->json([
            'id' => $cat->getId(),
            'name' => $cat->getName(),
            'keyLabel' => $cat->getKeyLabel(),
            'createdAt' => $cat->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'usageCount' => $usageCount,
        ]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(InventoryCategory $cat, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($cat);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/columns', methods: ['GET'])]
    public function columns(InventoryCategory $cat, EntityManagerInterface $em): JsonResponse
    {
        $rows = $em->createQueryBuilder()
            ->select('DISTINCT e.colLabel')
            ->from(NodeInventoryEntry::class, 'e')
            ->where('e.category = :cat')
            ->setParameter('cat', $cat)
            ->orderBy('e.colLabel', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return $this->json(array_map(fn($r) => $r['colLabel'], $rows));
    }

    #[Route('/{id}/column-config', methods: ['GET'])]
    public function getColumnConfig(InventoryCategory $cat, EntityManagerInterface $em): JsonResponse
    {
        $discovered = $this->fetchDiscoveredColumns($cat, $em);
        return $this->json([
            'columns' => $this->mergeColumnConfig($cat->getColumnConfig(), $discovered),
            'sort' => $this->normalizeSortConfig($cat->getSortConfig()),
        ]);
    }

    #[Route('/{id}/column-config', methods: ['PUT'])]
    public function updateColumnConfig(InventoryCategory $cat, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $columns = $data['columns'] ?? null;
        if (!is_array($columns)) {
            return $this->json(['error' => 'columns must be an array'], Response::HTTP_BAD_REQUEST);
        }

        $config = [];
        $seen = [];
        foreach ($columns as $col) {
            $label = is_array($col) ? ($col['label'] ?? null) : null;
            if (!is_string($label) || $label === '' || isset($seen[$label])) {
                continue;
            }
            $seen[$label] = true;
            $config[] = [
                'label' => $label,
                'visible' => !isset($col['visible']) || (bool)$col['visible'],
            ];
        }

        $cat->setColumnConfig($config);

        if (array_key_exists('sort', $data)) {
            $cat->setSortConfig($this->normalizeSortConfig($data['sort']));
        }

        $em->flush();

        $discovered = $this->fetchDiscoveredColumns($cat, $em);
        return $this->json([
            'columns' => $this->mergeColumnConfig($cat->getColumnConfig(), $discovered),
            'sort' => $this->normalizeSortConfig($cat->getSortConfig()),
        ]);
    }

    /**
     * @return array{column: string|null, direction: 'asc'|'desc'}
     */
    private function normalizeSortConfig(mixed $raw): array
    {
        $column = null;
        $direction = 'asc';

        if (is_array($raw)) {
            $col = $raw['column'] ?? null;
            if (is_string($col) && $col !== '') {
                $column = $col;
            }
            $dir = $raw['direction'] ?? null;
            if (is_string($dir) && strtolower($dir) === 'desc') {
                $direction = 'desc';
            }
        }

        return ['column' => $column, 'direction' => $direction];
    }

    /** @return string[] */
    private function fetchDiscoveredColumns(InventoryCategory $cat, EntityManagerInterface $em): array
    {
        $rows = $em->createQueryBuilder()
            ->select('DISTINCT e.colLabel')
            ->from(NodeInventoryEntry::class, 'e')
            ->where('e.category = :cat')
            ->setParameter('cat', $cat)
            ->orderBy('e.colLabel', 'ASC')
            ->getQuery()
            ->getArrayResult();

        return array_map(fn($r) => $r['colLabel'], $rows);
    }

    /**
     * @param array<int, array{label: string, visible: bool}>|null $config
     * @param string[] $discovered
     * @return array<int, array{label: string, visible: bool}>
     */
    private function mergeColumnConfig(?array $config, array $discovered): array
    {
        $known = [];
        $result = [];
        foreach (($config ?? []) as $item) {
            $label = $item['label'] ?? null;
            if (!is_string($label) || $label === '' || isset($known[$label])) {
                continue;
            }
            $known[$label] = true;
            $result[] = [
                'label' => $label,
                'visible' => !isset($item['visible']) || (bool)$item['visible'],
            ];
        }

        foreach ($discovered as $label) {
            if (isset($known[$label])) {
                continue;
            }
            $known[$label] = true;
            $result[] = ['label' => $label, 'visible' => true];
        }

        return $result;
    }

    #[Route('/structure', methods: ['GET'], priority: 10)]
    public function structure(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json([]);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json([]);
        }

        // Get all unique category/entryKey/colLabel combinations for this context
        $qb = $em->createQueryBuilder();
        $rows = $qb->select('IDENTITY(e.category) as categoryId, e.categoryName, e.entryKey, e.colLabel')
            ->from(NodeInventoryEntry::class, 'e')
            ->join('e.node', 'n')
            ->where('n.context = :context')
            ->setParameter('context', $context)
            ->groupBy('e.category, e.categoryName, e.entryKey, e.colLabel')
            ->orderBy('e.categoryName', 'ASC')
            ->addOrderBy('e.entryKey', 'ASC')
            ->addOrderBy('e.colLabel', 'ASC')
            ->getQuery()
            ->getArrayResult();

        // Group: category → entries[key → columns[]]
        $categories = [];
        foreach ($rows as $row) {
            $catName = $row['categoryName'];
            $catId = $row['categoryId'];
            $key = $row['entryKey'];
            $col = $row['colLabel'];

            $catKey = $catId ?: '__' . $catName;
            if (!isset($categories[$catKey])) {
                $categories[$catKey] = ['categoryId' => $catId ? (int)$catId : null, 'categoryName' => $catName, 'entries' => []];
            }
            if (!isset($categories[$catKey]['entries'][$key])) {
                $categories[$catKey]['entries'][$key] = ['key' => $key, 'columns' => []];
            }
            $categories[$catKey]['entries'][$key]['columns'][] = $col;
        }

        // Convert to indexed arrays
        $result = [];
        foreach ($categories as $cat) {
            $cat['entries'] = array_values($cat['entries']);
            $result[] = $cat;
        }

        return $this->json($result);
    }
}

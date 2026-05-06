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

#[Route('/api')]
class NodeColumnsController extends AbstractController
{
    /**
     * Default node columns config used when a context has no custom config.
     *
     * Each entry: { id, primary: {field, params?}, secondary?: {field, params?}, labelOverride? }
     */
    public const ALLOWED_PAGE_SIZES = [5, 10, 15, 25, 50, 100, 200];
    public const DEFAULT_PAGE_SIZE = 15;

    public static function defaultConfig(): array
    {
        return [
            'columns' => [
                ['id' => 'score', 'primary' => ['field' => 'score'], 'secondary' => null, 'width' => 'min'],
                ['id' => 'hostname', 'primary' => ['field' => 'hostname'], 'secondary' => ['field' => 'tags'], 'width' => 'auto'],
                ['id' => 'ipAddress', 'primary' => ['field' => 'ipAddress'], 'secondary' => null, 'width' => 'auto'],
                ['id' => 'manufacturer', 'primary' => ['field' => 'manufacturer'], 'secondary' => ['field' => 'model'], 'width' => 'auto'],
                ['id' => 'discoveredModel', 'primary' => ['field' => 'discoveredModel'], 'secondary' => null, 'width' => 'auto'],
                ['id' => 'discoveredVersion', 'primary' => ['field' => 'discoveredVersion'], 'secondary' => null, 'width' => 'min'],
                ['id' => 'policy', 'primary' => ['field' => 'policy'], 'secondary' => null, 'width' => 'min'],
                ['id' => 'complianceBar', 'primary' => ['field' => 'complianceBar'], 'secondary' => null, 'width' => 'min', 'minWidth' => 300],
            ],
            'pageSize' => self::DEFAULT_PAGE_SIZE,
            'defaultSort' => ['column' => 'ipAddress', 'direction' => 'asc'],
        ];
    }

    /**
     * Catalog of available fields. The frontend uses this to render the picker
     * in the settings tab and to know which fields are reactive / sortable / etc.
     */
    public static function catalog(): array
    {
        return [
            'categories' => [
                ['key' => 'score', 'labelKey' => 'nodeColumns.cat.score'],
                ['key' => 'identity', 'labelKey' => 'nodeColumns.cat.identity'],
                ['key' => 'hardware', 'labelKey' => 'nodeColumns.cat.hardware'],
                ['key' => 'tags', 'labelKey' => 'nodeColumns.cat.tags'],
                ['key' => 'policy', 'labelKey' => 'nodeColumns.cat.policy'],
                ['key' => 'vulnerability', 'labelKey' => 'nodeColumns.cat.vulnerability'],
                ['key' => 'systemUpdate', 'labelKey' => 'nodeColumns.cat.systemUpdate'],
                ['key' => 'tasks', 'labelKey' => 'nodeColumns.cat.tasks'],
                ['key' => 'monitoring', 'labelKey' => 'nodeColumns.cat.monitoring'],
                ['key' => 'misc', 'labelKey' => 'nodeColumns.cat.misc'],
                ['key' => 'inventory', 'labelKey' => 'nodeColumns.cat.inventory'],
            ],
            'fields' => [
                // Score
                ['key' => 'score', 'category' => 'score', 'sortable' => true, 'reactive' => true, 'primaryOnly' => true],
                ['key' => 'complianceBar', 'category' => 'score', 'sortable' => true, 'reactive' => true, 'primaryOnly' => true],
                ['key' => 'complianceBarOnly', 'category' => 'score', 'sortable' => true, 'reactive' => true, 'primaryOnly' => true],
                ['key' => 'complianceScore', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'complianceScoreNumeric', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'compliancePenalty', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'vulnerabilityScore', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'vulnerabilityScoreNumeric', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'vulnerabilityPenalty', 'category' => 'score', 'sortable' => true, 'reactive' => true],
                ['key' => 'systemUpdateScore', 'category' => 'score', 'sortable' => true],
                ['key' => 'systemUpdateScoreNumeric', 'category' => 'score', 'sortable' => true],

                // Identity
                ['key' => 'hostname', 'category' => 'identity', 'sortable' => true],
                ['key' => 'name', 'category' => 'identity', 'sortable' => true],
                ['key' => 'ipAddress', 'category' => 'identity', 'sortable' => true],

                // Hardware
                ['key' => 'manufacturer', 'category' => 'hardware', 'sortable' => true, 'primaryOnly' => true],
                ['key' => 'model', 'category' => 'hardware', 'sortable' => true],
                ['key' => 'profile', 'category' => 'hardware', 'sortable' => true],
                ['key' => 'productModel', 'category' => 'hardware', 'sortable' => true],
                ['key' => 'discoveredModel', 'category' => 'hardware', 'sortable' => true],
                ['key' => 'discoveredVersion', 'category' => 'hardware', 'sortable' => true],

                // Tags
                ['key' => 'tags', 'category' => 'tags'],
                ['key' => 'manualTags', 'category' => 'tags'],
                ['key' => 'dynamicTags', 'category' => 'tags'],

                // Policy
                ['key' => 'policy', 'category' => 'policy', 'sortable' => true],

                // Vulnerability
                ['key' => 'cveTotal', 'category' => 'vulnerability', 'sortable' => true, 'reactive' => true],
                ['key' => 'cveCritical', 'category' => 'vulnerability', 'sortable' => true, 'reactive' => true],
                ['key' => 'cveHigh', 'category' => 'vulnerability', 'sortable' => true, 'reactive' => true],
                ['key' => 'cveMedium', 'category' => 'vulnerability', 'sortable' => true, 'reactive' => true],
                ['key' => 'cveLow', 'category' => 'vulnerability', 'sortable' => true, 'reactive' => true],

                // System update
                ['key' => 'recommendedVersion', 'category' => 'systemUpdate'],
                ['key' => 'releaseDate', 'category' => 'systemUpdate', 'sortable' => true],
                ['key' => 'endOfSaleDate', 'category' => 'systemUpdate', 'sortable' => true],
                ['key' => 'endOfSupportDate', 'category' => 'systemUpdate', 'sortable' => true],
                ['key' => 'endOfLifeDate', 'category' => 'systemUpdate', 'sortable' => true],

                // Tasks
                ['key' => 'taskIndicators', 'category' => 'tasks', 'primaryOnly' => true, 'reactive' => true],

                // Monitoring
                ['key' => 'isReachable', 'category' => 'monitoring', 'primaryOnly' => true, 'reactive' => true],
                ['key' => 'lastPingAt', 'category' => 'monitoring', 'sortable' => true, 'reactive' => true],

                // Misc
                ['key' => 'createdAt', 'category' => 'misc', 'sortable' => true],

                // Inventory (parameterized: needs category + column)
                ['key' => 'inventory', 'category' => 'inventory', 'parameterized' => true, 'sortable' => true],
            ],
        ];
    }

    private function normalizeFieldRef(mixed $raw, array $allowedFields): ?array
    {
        if (!is_array($raw)) return null;
        $field = $raw['field'] ?? null;
        if (!is_string($field) || !isset($allowedFields[$field])) return null;

        $entry = ['field' => $field];

        if (!empty($allowedFields[$field]['parameterized'])) {
            $params = $raw['params'] ?? null;
            if (!is_array($params)) return null;
            $clean = [];
            foreach ($params as $k => $v) {
                if (is_string($k) && (is_string($v) || is_int($v) || is_null($v))) {
                    $clean[$k] = $v;
                }
            }
            $entry['params'] = $clean;
        }

        return $entry;
    }

    private function normalizeConfig(mixed $raw, array $allowedFields): array
    {
        if (!is_array($raw)) return self::defaultConfig();
        $cols = $raw['columns'] ?? null;
        if (!is_array($cols) || empty($cols)) return self::defaultConfig();

        $out = [];
        $seenIds = [];
        foreach ($cols as $col) {
            if (!is_array($col)) continue;
            $primary = $this->normalizeFieldRef($col['primary'] ?? null, $allowedFields);
            if (!$primary) continue;

            $secondary = null;
            if (isset($col['secondary'])) {
                $sec = $this->normalizeFieldRef($col['secondary'], $allowedFields);
                if ($sec && empty($allowedFields[$sec['field']]['primaryOnly'])) {
                    $secondary = $sec;
                }
            }

            $id = is_string($col['id'] ?? null) && $col['id'] !== '' ? $col['id'] : bin2hex(random_bytes(4));
            while (isset($seenIds[$id])) {
                $id = bin2hex(random_bytes(4));
            }
            $seenIds[$id] = true;

            $entry = [
                'id' => $id,
                'primary' => $primary,
                'secondary' => $secondary,
            ];
            if (isset($col['labelOverride']) && is_string($col['labelOverride']) && $col['labelOverride'] !== '') {
                $entry['labelOverride'] = $col['labelOverride'];
            }
            if (isset($col['align']) && in_array($col['align'], ['left', 'center', 'right'], true)) {
                $entry['align'] = $col['align'];
            }
            if (isset($col['width']) && in_array($col['width'], ['auto', 'min'], true)) {
                $entry['width'] = $col['width'];
            }
            if (isset($col['minWidth']) && is_numeric($col['minWidth'])) {
                $mw = (int) $col['minWidth'];
                if ($mw > 0 && $mw <= 2000) {
                    $entry['minWidth'] = $mw;
                }
            }
            $out[] = $entry;
        }

        if (empty($out)) return self::defaultConfig();

        $result = ['columns' => $out];

        if (isset($raw['pageSize']) && is_numeric($raw['pageSize'])) {
            $ps = (int) $raw['pageSize'];
            if (in_array($ps, self::ALLOWED_PAGE_SIZES, true)) {
                $result['pageSize'] = $ps;
            }
        }
        if (!isset($result['pageSize'])) {
            $result['pageSize'] = self::DEFAULT_PAGE_SIZE;
        }

        if (isset($raw['defaultSort']) && is_array($raw['defaultSort'])) {
            $col = $raw['defaultSort']['column'] ?? null;
            $dir = $raw['defaultSort']['direction'] ?? 'asc';
            $dir = in_array($dir, ['asc', 'desc'], true) ? $dir : 'asc';
            if (is_string($col) && $col !== '' && isset($allowedFields[$col]) && !empty($allowedFields[$col]['sortable'])) {
                $result['defaultSort'] = ['column' => $col, 'direction' => $dir];
            } else {
                $result['defaultSort'] = null;
            }
        } elseif (array_key_exists('defaultSort', $raw)) {
            $result['defaultSort'] = null;
        } else {
            $result['defaultSort'] = ['column' => 'ipAddress', 'direction' => 'asc'];
        }

        return $result;
    }

    private function fieldsByKey(): array
    {
        $out = [];
        foreach (self::catalog()['fields'] as $f) {
            $out[$f['key']] = $f;
        }
        return $out;
    }

    private function ensureContextAccess(Context $context): bool
    {
        if ($this->isGranted('ROLE_ADMIN')) return true;
        $user = $this->getUser();
        return $user !== null && $context->getUsers()->contains($user);
    }

    #[Route('/nodes/columns-catalog', methods: ['GET'])]
    public function catalogEndpoint(): JsonResponse
    {
        return $this->json(self::catalog());
    }

    #[Route('/contexts/{id}/node-columns-config', methods: ['GET'])]
    public function getConfig(Context $context): JsonResponse
    {
        if (!$this->ensureContextAccess($context)) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $stored = $context->getNodeColumnsConfig();
        $allowed = $this->fieldsByKey();
        $config = $stored ? $this->normalizeConfig($stored, $allowed) : self::defaultConfig();

        return $this->json($config);
    }

    #[Route('/contexts/{id}/node-columns-config', methods: ['PUT'])]
    public function putConfig(Context $context, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->ensureContextAccess($context)) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true);
        $allowed = $this->fieldsByKey();
        $config = $this->normalizeConfig($data, $allowed);

        $context->setNodeColumnsConfig($config);
        $em->flush();

        return $this->json($config);
    }

    #[Route('/contexts/{id}/node-columns-config', methods: ['DELETE'])]
    public function deleteConfig(Context $context, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->ensureContextAccess($context)) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $context->setNodeColumnsConfig(null);
        $em->flush();

        return $this->json(self::defaultConfig());
    }

    /**
     * Lists the inventory category+column combinations available for the context.
     * Used by the settings UI when the user picks an "inventory" column.
     */
    #[Route('/contexts/{id}/inventory-columns-catalog', methods: ['GET'])]
    public function inventoryCatalog(Context $context, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->ensureContextAccess($context)) {
            return $this->json(['error' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $rows = $em->getConnection()->fetchAllAssociative(
            "SELECT DISTINCT e.category_name, e.entry_key, e.col_label
             FROM node_inventory_entry e
             JOIN node n ON n.id = e.node_id
             JOIN collection_tag ct ON ct.id = e.collection_tag_id
             WHERE n.context_id = :ctx AND ct.name = 'latest'
             ORDER BY e.category_name ASC, e.entry_key ASC, e.col_label ASC",
            ['ctx' => $context->getId()]
        );

        $grouped = [];
        foreach ($rows as $r) {
            $cat = $r['category_name'];
            $key = $r['entry_key'];
            $col = $r['col_label'];
            if (!isset($grouped[$cat])) {
                $grouped[$cat] = ['columns' => [], 'keys' => []];
            }
            if (!in_array($col, $grouped[$cat]['columns'], true)) {
                $grouped[$cat]['columns'][] = $col;
            }
            if (!isset($grouped[$cat]['keys'][$key])) {
                $grouped[$cat]['keys'][$key] = [];
            }
            if (!in_array($col, $grouped[$cat]['keys'][$key], true)) {
                $grouped[$cat]['keys'][$key][] = $col;
            }
        }

        $out = [];
        foreach ($grouped as $cat => $data) {
            $keys = [];
            foreach ($data['keys'] as $k => $cols) {
                $keys[] = ['key' => $k, 'columns' => $cols];
            }
            $out[] = [
                'category' => $cat,
                'columns' => $data['columns'],
                'keys' => $keys,
            ];
        }

        return $this->json($out);
    }
}

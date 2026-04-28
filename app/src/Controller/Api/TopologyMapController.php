<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\InventoryCategory;
use App\Entity\TopologyDevice;
use App\Entity\TopologyLink;
use App\Entity\TopologyMap;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/topology-maps')]
class TopologyMapController extends AbstractController
{
    private function serialize(TopologyMap $m, ?int $deviceCount = null, ?int $linkCount = null): array
    {
        return [
            'id' => $m->getId(),
            'name' => $m->getName(),
            'description' => $m->getDescription(),
            'defaultProtocol' => $m->getDefaultProtocol(),
            'designConfig' => $m->getDesignConfig(),
            'linkRules' => $m->getLinkRules(),
            'createdAt' => $m->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'lastRefreshedAt' => $m->getLastRefreshedAt()?->format(\DateTimeInterface::ATOM),
            'deviceCount' => $deviceCount,
            'linkCount' => $linkCount,
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $maps = $em->getRepository(TopologyMap::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        // Aggregate counts in a single query for efficiency
        $countsRows = $em->createQuery(
            'SELECT IDENTITY(d.map) AS mapId, COUNT(d.id) AS cnt
             FROM App\Entity\TopologyDevice d
             WHERE d.map IN (:maps)
             GROUP BY d.map'
        )->setParameter('maps', $maps)->getArrayResult();
        $deviceCounts = [];
        foreach ($countsRows as $row) {
            $deviceCounts[(int)$row['mapId']] = (int)$row['cnt'];
        }

        $linkRows = $em->createQuery(
            'SELECT IDENTITY(l.map) AS mapId, COUNT(l.id) AS cnt
             FROM App\Entity\TopologyLink l
             WHERE l.map IN (:maps)
             GROUP BY l.map'
        )->setParameter('maps', $maps)->getArrayResult();
        $linkCounts = [];
        foreach ($linkRows as $row) {
            $linkCounts[(int)$row['mapId']] = (int)$row['cnt'];
        }

        return $this->json(array_map(
            fn(TopologyMap $m) => $this->serialize(
                $m,
                $deviceCounts[$m->getId()] ?? 0,
                $linkCounts[$m->getId()] ?? 0,
            ),
            $maps
        ));
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

        $name = trim($data['name'] ?? '');
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $map = new TopologyMap();
        $map->setName($name);
        $map->setDescription($data['description'] ?? null);
        $map->setContext($context);
        $map->setDefaultProtocol($data['defaultProtocol'] ?? null);

        $em->persist($map);
        $em->flush();

        return $this->json($this->serialize($map, 0, 0), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(TopologyMap $map, EntityManagerInterface $em): JsonResponse
    {
        $deviceCount = (int) $em->createQuery(
            'SELECT COUNT(d.id) FROM App\Entity\TopologyDevice d WHERE d.map = :m'
        )->setParameter('m', $map)->getSingleScalarResult();
        $linkCount = (int) $em->createQuery(
            'SELECT COUNT(l.id) FROM App\Entity\TopologyLink l WHERE l.map = :m'
        )->setParameter('m', $map)->getSingleScalarResult();

        return $this->json($this->serialize($map, $deviceCount, $linkCount));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(TopologyMap $map, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (isset($data['name'])) {
            $name = trim($data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $map->setName($name);
        }
        if (array_key_exists('description', $data)) {
            $map->setDescription($data['description']);
        }
        if (array_key_exists('defaultProtocol', $data)) {
            $map->setDefaultProtocol($data['defaultProtocol']);
        }
        if (array_key_exists('layout', $data)) {
            $map->setLayout($data['layout']);
        }
        if (array_key_exists('designConfig', $data)) {
            $map->setDesignConfig((array) $data['designConfig']);
        }
        if (array_key_exists('linkRules', $data)) {
            $map->setLinkRules((array) $data['linkRules']);
        }

        $em->flush();
        return $this->json($this->serialize($map));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(TopologyMap $map, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($map);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Returns the list of node IDs currently assigned to this map
     * (only internal nodes, not external neighbors).
     */
    #[Route('/{id}/nodes', methods: ['GET'])]
    public function listNodes(TopologyMap $map, EntityManagerInterface $em): JsonResponse
    {
        $devices = $em->getRepository(TopologyDevice::class)->findBy(['map' => $map]);
        $nodeIds = [];
        foreach ($devices as $d) {
            if ($d->getNode()) {
                $nodeIds[] = $d->getNode()->getId();
            }
        }
        return $this->json($nodeIds);
    }

    /**
     * Sync assigned nodes: creates TopologyDevice for new nodes,
     * removes TopologyDevice for unassigned nodes (keeps external neighbors).
     */
    #[Route('/{id}/nodes', methods: ['PUT'])]
    public function syncNodes(TopologyMap $map, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $wantedIds = array_map('intval', $data['nodeIds'] ?? []);

        // Get existing internal devices (those linked to a Node)
        $existingDevices = $em->getRepository(TopologyDevice::class)->findBy(['map' => $map]);
        $existingByNodeId = [];
        foreach ($existingDevices as $d) {
            if ($d->getNode()) {
                $existingByNodeId[$d->getNode()->getId()] = $d;
            }
        }

        $existingNodeIds = array_keys($existingByNodeId);

        // Remove devices for nodes no longer wanted
        $toRemove = array_diff($existingNodeIds, $wantedIds);
        foreach ($toRemove as $nodeId) {
            $device = $existingByNodeId[$nodeId];
            // Also remove any links connected to this device
            $em->createQueryBuilder()
                ->delete(TopologyLink::class, 'l')
                ->where('l.sourceDevice = :d OR l.targetDevice = :d')
                ->setParameter('d', $device)
                ->getQuery()
                ->execute();
            $em->remove($device);
        }

        // Add devices for new nodes
        $toAdd = array_diff($wantedIds, $existingNodeIds);
        foreach ($toAdd as $nodeId) {
            $node = $em->getRepository(Node::class)->find($nodeId);
            if (!$node) continue;

            $device = new TopologyDevice();
            $device->setMap($map);
            $device->setNode($node);
            $device->setName($node->getName() ?: $node->getHostname() ?: $node->getIpAddress());
            $device->setMgmtAddress($node->getIpAddress());
            $em->persist($device);
        }

        // Reset saved layout when nodes change, so cytoscape recalculates positions
        if (!empty($toAdd) || !empty($toRemove)) {
            $map->setLayout(null);
        }

        $em->flush();

        return $this->json(['added' => count($toAdd), 'removed' => count($toRemove)]);
    }

    /**
     * Generate topology links from inventory data based on the map's linkRules.
     * Deletes existing links for the given protocol(s) first, then recreates from inventory.
     */
    #[Route('/{id}/generate-links', methods: ['POST'])]
    public function generateLinks(TopologyMap $map, EntityManagerInterface $em): JsonResponse
    {
        $linkRules = $map->getLinkRules();
        if (empty($linkRules)) {
            return $this->json(['error' => 'No link rules configured on this map'], Response::HTTP_BAD_REQUEST);
        }

        $context = $map->getContext();

        // Index devices by node id, name, hostname, and IP for correlation
        $allDevices = $em->getRepository(TopologyDevice::class)->findBy(['map' => $map]);
        $deviceByNodeId = [];
        $deviceByKey = []; // lowercase name/hostname/ip → device
        foreach ($allDevices as $d) {
            if ($d->getNode()) {
                $node = $d->getNode();
                $deviceByNodeId[$node->getId()] = $d;
                if ($node->getName()) $deviceByKey[strtolower($node->getName())] = $d;
                if ($node->getHostname()) $deviceByKey[strtolower($node->getHostname())] = $d;
                if ($node->getIpAddress()) $deviceByKey[strtolower($node->getIpAddress())] = $d;
            }
            $deviceByKey[strtolower($d->getName())] = $d;
            if ($d->getMgmtAddress()) $deviceByKey[strtolower($d->getMgmtAddress())] = $d;
            if ($d->getChassisId()) $deviceByKey[strtolower($d->getChassisId())] = $d;
        }

        $stats = ['linksCreated' => 0, 'linksUpdated' => 0, 'errors' => []];

        foreach ($linkRules as $rule) {
            $rule = $this->normalizeRule($rule);
            $protocol = $rule['protocol'];
            $categoryId = $rule['inventoryCategoryId'] ?? null;
            $destNodeCol = $rule['destNodeColumn'] ?? null;

            if (!$categoryId || !$destNodeCol) {
                $stats['errors'][] = 'Missing inventoryCategoryId or destNodeColumn in rule';
                continue;
            }

            // Delete existing auto-generated links for this protocol (preserve manual links)
            $em->createQueryBuilder()
                ->delete(TopologyLink::class, 'l')
                ->where('l.map = :map AND l.protocol = :proto AND l.isManual = false')
                ->setParameter('map', $map)
                ->setParameter('proto', $protocol)
                ->getQuery()
                ->execute();

            if ($protocol === 'isis') {
                $this->generateIsisLinks($rule, $map, $context, $deviceByNodeId, $deviceByKey, $em, $stats);
            } else {
                $this->generateStandardLinks($rule, $map, $context, $deviceByNodeId, $deviceByKey, $em, $stats);
            }
        }

        $em->flush();

        // Sweep external devices that no longer have any link attached on this map
        $orphanedExternals = $em->createQueryBuilder()
            ->select('d')
            ->from(TopologyDevice::class, 'd')
            ->leftJoin(TopologyLink::class, 'l', 'WITH', 'l.map = d.map AND (l.sourceDevice = d OR l.targetDevice = d)')
            ->where('d.map = :map AND d.node IS NULL AND l.id IS NULL')
            ->setParameter('map', $map)
            ->getQuery()
            ->getResult();
        foreach ($orphanedExternals as $orphan) {
            $em->remove($orphan);
        }

        $map->setLastRefreshedAt(new \DateTimeImmutable());
        $em->flush();

        return $this->json($stats);
    }

    /**
     * Normalize a link rule for backward compatibility.
     */
    private function normalizeRule(array $rule): array
    {
        if (empty($rule['destNodeColumn']) && !empty($rule['remoteNameColumn'])) {
            $rule['destNodeColumn'] = $rule['remoteNameColumn'];
        }
        if (empty($rule['nodeMatchField'])) {
            $rule['nodeMatchField'] = 'auto';
        }
        if (empty($rule['metricColumn']) && !empty($rule['weightColumn'])) {
            $rule['metricColumn'] = $rule['weightColumn'];
        }
        // Default true for backward compat with existing maps
        $rule['includeExternalNeighbors'] = !array_key_exists('includeExternalNeighbors', $rule)
            || (bool) $rule['includeExternalNeighbors'];
        return $rule;
    }

    /**
     * Resolve a target device from an identifier value using nodeMatchField.
     *
     * @param bool $allowExternal When false, the function returns null instead of creating
     *                            an external TopologyDevice for an unknown neighbor — the
     *                            caller is then expected to drop the edge entirely.
     */
    private function resolveTargetDevice(
        string $destValue,
        string $nodeMatchField,
        array &$deviceByKey,
        array &$deviceByNodeId,
        Context $context,
        EntityManagerInterface $em,
        TopologyMap $map,
        bool $allowExternal = true,
    ): ?TopologyDevice {
        $lowerDest = strtolower($destValue);

        if ($nodeMatchField === 'auto') {
            // Legacy behavior: try all identifiers
            $target = $deviceByKey[$lowerDest] ?? null;
            if ($target) {
                if (!$allowExternal && $target->isExternal()) return null;
                return $target;
            }

            // Try Node lookup in context
            $targetNode = null;
            foreach (['name', 'hostname', 'ipAddress'] as $field) {
                $targetNode = $em->getRepository(Node::class)->findOneBy(['context' => $context, $field => $destValue]);
                if ($targetNode) break;
            }
        } else {
            // Specific field: match against that field only
            foreach ($deviceByNodeId as $device) {
                $node = $device->getNode();
                if (!$node) continue;
                $fieldValue = match ($nodeMatchField) {
                    'name' => $node->getName(),
                    'hostname' => $node->getHostname(),
                    'ipAddress' => $node->getIpAddress(),
                    'chassisId' => $device->getChassisId(),
                    'mgmtAddress' => $device->getMgmtAddress(),
                    default => null,
                };
                if ($fieldValue && strtolower($fieldValue) === $lowerDest) {
                    return $device;
                }
            }
            // Also try in deviceByKey as fallback
            $target = $deviceByKey[$lowerDest] ?? null;
            if ($target) {
                if (!$allowExternal && $target->isExternal()) return null;
                return $target;
            }

            // Try Node lookup using specific field
            $nodeField = match ($nodeMatchField) {
                'name' => 'name',
                'hostname' => 'hostname',
                'ipAddress' => 'ipAddress',
                'chassisId' => null,
                'mgmtAddress' => 'ipAddress',
                default => null,
            };
            $targetNode = null;
            if ($nodeField) {
                $targetNode = $em->getRepository(Node::class)->findOneBy(['context' => $context, $nodeField => $destValue]);
            }
        }

        // If we found a known node that already has a device, use it
        if (isset($targetNode) && $targetNode && isset($deviceByNodeId[$targetNode->getId()])) {
            return $deviceByNodeId[$targetNode->getId()];
        }

        // No managed device matches: skip when external neighbors are disabled
        if (!$allowExternal) {
            return null;
        }

        // Create external device
        $targetDevice = new TopologyDevice();
        $targetDevice->setMap($map);
        $targetDevice->setNode($targetNode ?? null);
        $targetDevice->setName($destValue);
        $em->persist($targetDevice);
        $em->flush();

        if (isset($targetNode) && $targetNode) {
            $deviceByNodeId[$targetNode->getId()] = $targetDevice;
        }
        $deviceByKey[$lowerDest] = $targetDevice;

        return $targetDevice;
    }

    /**
     * Generate links using standard approach (LLDP, CDP, STP, OSPF, BGP).
     */
    private function generateStandardLinks(
        array $rule, TopologyMap $map, Context $context,
        array &$deviceByNodeId, array &$deviceByKey,
        EntityManagerInterface $em, array &$stats,
    ): void {
        $protocol = $rule['protocol'];
        $categoryId = $rule['inventoryCategoryId'];
        $destNodeCol = $rule['destNodeColumn'];
        $nodeMatchField = $rule['nodeMatchField'];
        $localPortCol = $rule['localPortColumn'] ?? '';
        $remotePortCol = $rule['remotePortColumn'] ?? '';
        $weightCol = $rule['metricColumn'] ?? ($rule['weightColumn'] ?? '');
        $allowExternal = $rule['includeExternalNeighbors'] ?? true;

        $createdLinks = [];

        foreach ($deviceByNodeId as $nodeId => $sourceDevice) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $sourceDevice->getNode(),
                'category' => $categoryId,
            ]);

            $byKey = [];
            foreach ($entries as $entry) {
                $byKey[$entry->getEntryKey()][$entry->getColLabel()] = $entry->getValue();
            }

            foreach ($byKey as $entryKey => $cols) {
                $remoteName = $cols[$destNodeCol] ?? null;
                if (!$remoteName) continue;

                $localPort = ($localPortCol && isset($cols[$localPortCol])) ? $cols[$localPortCol] : $entryKey;
                $remotePort = $remotePortCol ? ($cols[$remotePortCol] ?? null) : null;
                $weight = ($weightCol && isset($cols[$weightCol]) && is_numeric($cols[$weightCol])) ? (int) $cols[$weightCol] : null;

                $targetDevice = $this->resolveTargetDevice($remoteName, $nodeMatchField, $deviceByKey, $deviceByNodeId, $context, $em, $map, $allowExternal);
                if (!$targetDevice) continue;

                // Deduplicate bidirectional
                $srcId = $sourceDevice->getId();
                $tgtId = $targetDevice->getId();
                $minId = min($srcId, $tgtId);
                $maxId = max($srcId, $tgtId);
                $portA = ($srcId <= $tgtId) ? ($localPort ?? '') : ($remotePort ?? '');
                $portB = ($srcId <= $tgtId) ? ($remotePort ?? '') : ($localPort ?? '');
                $linkKey = "$minId:$maxId:$portA:$portB";
                if (isset($createdLinks[$linkKey])) continue;
                $createdLinks[$linkKey] = true;

                $link = new TopologyLink();
                $link->setMap($map);
                $link->setSourceDevice($sourceDevice);
                $link->setTargetDevice($targetDevice);
                $link->setProtocol($protocol);
                $link->setSourcePort($localPort);
                $link->setTargetPort($remotePort);
                $link->setStatus('up');
                $link->setWeight($weight);
                $em->persist($link);
                $stats['linksCreated']++;
            }
        }
    }

    /**
     * Generate ISIS links with bidirectional port matching.
     */
    private function generateIsisLinks(
        array $rule, TopologyMap $map, Context $context,
        array &$deviceByNodeId, array &$deviceByKey,
        EntityManagerInterface $em, array &$stats,
    ): void {
        $categoryId = $rule['inventoryCategoryId'];
        $destNodeCol = $rule['destNodeColumn'];
        $nodeMatchField = $rule['nodeMatchField'];
        $ifaceCol = $rule['sourceInterfaceColumn'] ?? '';
        $metricCol = $rule['metricColumn'] ?? '';
        $allowExternal = $rule['includeExternalNeighbors'] ?? true;

        // Phase 1: Collect all directed adjacencies
        $directedEdges = [];

        foreach ($deviceByNodeId as $nodeId => $sourceDevice) {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $sourceDevice->getNode(),
                'category' => $categoryId,
            ]);

            $byKey = [];
            foreach ($entries as $entry) {
                $byKey[$entry->getEntryKey()][$entry->getColLabel()] = $entry->getValue();
            }

            foreach ($byKey as $entryKey => $cols) {
                $remoteName = $cols[$destNodeCol] ?? null;
                if (!$remoteName) continue;

                $localIface = ($ifaceCol && isset($cols[$ifaceCol])) ? $cols[$ifaceCol] : $entryKey;
                $metric = ($metricCol && isset($cols[$metricCol]) && is_numeric($cols[$metricCol])) ? (int) $cols[$metricCol] : null;

                $targetDevice = $this->resolveTargetDevice($remoteName, $nodeMatchField, $deviceByKey, $deviceByNodeId, $context, $em, $map, $allowExternal);
                if (!$targetDevice) continue;

                $directedEdges[] = [
                    'source' => $sourceDevice,
                    'target' => $targetDevice,
                    'localPort' => $localIface,
                    'metric' => $metric,
                ];
            }
        }

        // Phase 2: Group by device pair and match bidirectionally
        $pairMap = [];
        foreach ($directedEdges as $edge) {
            $sId = $edge['source']->getId();
            $tId = $edge['target']->getId();
            $minId = min($sId, $tId);
            $maxId = max($sId, $tId);
            $key = "$minId:$maxId";
            $direction = ($sId <= $tId) ? 'ab' : 'ba';
            $pairMap[$key][$direction][] = $edge;
        }

        foreach ($pairMap as $sides) {
            $ab = $sides['ab'] ?? [];
            $ba = $sides['ba'] ?? [];
            $matchedBa = [];

            foreach ($ab as $eAB) {
                $found = false;
                foreach ($ba as $i => $eBA) {
                    if (in_array($i, $matchedBa, true)) continue;
                    // Match: B's local port becomes A's remote port
                    $link = new TopologyLink();
                    $link->setMap($map);
                    $link->setSourceDevice($eAB['source']);
                    $link->setTargetDevice($eAB['target']);
                    $link->setProtocol('isis');
                    $link->setSourcePort($eAB['localPort']);
                    $link->setTargetPort($eBA['localPort']);
                    $link->setWeight($eAB['metric'] ?? $eBA['metric']);
                    $link->setStatus('up');
                    $em->persist($link);
                    $stats['linksCreated']++;
                    $matchedBa[] = $i;
                    $found = true;
                    break;
                }
                if (!$found) {
                    // Unmatched A→B: no remote port info
                    $link = new TopologyLink();
                    $link->setMap($map);
                    $link->setSourceDevice($eAB['source']);
                    $link->setTargetDevice($eAB['target']);
                    $link->setProtocol('isis');
                    $link->setSourcePort($eAB['localPort']);
                    $link->setTargetPort(null);
                    $link->setWeight($eAB['metric']);
                    $link->setStatus('up');
                    $em->persist($link);
                    $stats['linksCreated']++;
                }
            }

            // Remaining unmatched B→A edges
            foreach ($ba as $i => $eBA) {
                if (in_array($i, $matchedBa, true)) continue;
                $link = new TopologyLink();
                $link->setMap($map);
                $link->setSourceDevice($eBA['source']);
                $link->setTargetDevice($eBA['target']);
                $link->setProtocol('isis');
                $link->setSourcePort($eBA['localPort']);
                $link->setTargetPort(null);
                $link->setWeight($eBA['metric']);
                $link->setStatus('up');
                $em->persist($link);
                $stats['linksCreated']++;
            }
        }
    }

    /**
     * Returns the graph data for visualization in cytoscape format.
     * Filters by protocol if `protocol` query param is provided.
     */
    #[Route('/{id}/graph', methods: ['GET'])]
    public function graph(TopologyMap $map, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $devices = $em->getRepository(TopologyDevice::class)->findBy(['map' => $map]);

        $protocolFilter = $request->query->get('protocol');
        $linkQb = $em->createQueryBuilder()
            ->select('l')
            ->from(TopologyLink::class, 'l')
            ->where('l.map = :map')
            ->setParameter('map', $map);
        if ($protocolFilter) {
            $linkQb->andWhere('l.protocol = :proto')->setParameter('proto', $protocolFilter);
        }
        $links = $linkQb->getQuery()->getResult();

        $layout = $map->getLayout() ?? [];

        $designConfig = $map->getDesignConfig();

        $nodesPayload = array_map(function (TopologyDevice $d) use ($layout) {
            $node = $d->getNode();
            $position = $layout[(string)$d->getId()] ?? null;
            return [
                'id' => (string) $d->getId(),
                'name' => $d->getName(),
                'isExternal' => $d->isExternal(),
                'nodeId' => $node?->getId(),
                'nodeName' => $node?->getName(),
                'nodeHostname' => $node?->getHostname(),
                'nodeIp' => $node?->getIpAddress(),
                'nodeManufacturer' => $node?->getManufacturer()?->getName(),
                'nodeModel' => $node?->getModel()?->getName(),
                'chassisId' => $d->getChassisId(),
                'mgmtAddress' => $d->getMgmtAddress(),
                'sysDescr' => $d->getSysDescr(),
                'isReachable' => $node?->getIsReachable(),
                'score' => $node?->getScore(),
                'styleOverride' => $d->getStyleOverride(),
                'position' => $position,
            ];
        }, $devices);

        // Collect inventory-based style rule columns for edge enrichment
        $invRuleColumns = [];
        $styleRules = $designConfig['styleRules'] ?? [];
        foreach ($styleRules as $rule) {
            if (($rule['condition'] ?? '') === 'linkInventory' && !empty($rule['inventoryCategoryId']) && !empty($rule['inventoryColumn'])) {
                $invRuleColumns[] = ['categoryId' => $rule['inventoryCategoryId'], 'column' => $rule['inventoryColumn']];
            }
        }

        // Pre-load inventory data for link enrichment if needed
        $deviceInventoryCache = [];
        if (!empty($invRuleColumns)) {
            foreach ($devices as $d) {
                $node = $d->getNode();
                if (!$node) continue;
                foreach ($invRuleColumns as $rc) {
                    $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                        'node' => $node,
                        'category' => $rc['categoryId'],
                        'colLabel' => $rc['column'],
                    ]);
                    foreach ($entries as $entry) {
                        $deviceInventoryCache[$d->getId()][$entry->getEntryKey()][$rc['column']] = $entry->getValue();
                    }
                }
            }
        }

        $edgesPayload = array_map(function (TopologyLink $l) use ($deviceInventoryCache) {
            $edge = [
                'id' => (string) $l->getId(),
                'source' => (string) $l->getSourceDevice()->getId(),
                'target' => (string) $l->getTargetDevice()->getId(),
                'protocol' => $l->getProtocol(),
                'sourcePort' => $l->getSourcePort(),
                'targetPort' => $l->getTargetPort(),
                'status' => $l->getStatus(),
                'weight' => $l->getWeight(),
                'metadata' => $l->getMetadata(),
                'isManual' => $l->getIsManual(),
                'styleOverride' => $l->getStyleOverride(),
            ];

            // Enrich with inventory data for linkInventory style rules
            if (!empty($deviceInventoryCache)) {
                $srcId = $l->getSourceDevice()->getId();
                $srcPort = $l->getSourcePort();
                if ($srcPort && isset($deviceInventoryCache[$srcId][$srcPort])) {
                    foreach ($deviceInventoryCache[$srcId][$srcPort] as $col => $val) {
                        $edge['inv_' . $col] = $val;
                    }
                }
                // Also check target side as fallback
                $tgtId = $l->getTargetDevice()->getId();
                $tgtPort = $l->getTargetPort();
                if ($tgtPort && isset($deviceInventoryCache[$tgtId][$tgtPort])) {
                    foreach ($deviceInventoryCache[$tgtId][$tgtPort] as $col => $val) {
                        if (!isset($edge['inv_' . $col])) {
                            $edge['inv_' . $col] = $val;
                        }
                    }
                }
            }

            return $edge;
        }, $links);

        $protocols = array_values(array_unique(array_filter(array_map(fn($l) => $l->getProtocol(), $links))));

        // Compute ISIS areas per device if protocol filter is isis
        $isisAreas = []; // deviceId => [area1, area2, ...]
        $allIsisAreas = [];
        if ($protocolFilter === 'isis') {
            $linkRules = $map->getLinkRules();
            foreach ($linkRules as $rule) {
                if (($rule['protocol'] ?? '') === 'isis' && !empty($rule['areaCategoryId']) && !empty($rule['areaColumn'])) {
                    $areaCatId = $rule['areaCategoryId'];
                    $areaCol = $rule['areaColumn'];
                    foreach ($devices as $d) {
                        $node = $d->getNode();
                        if (!$node) continue;
                        $areaEntries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                            'node' => $node,
                            'category' => $areaCatId,
                            'colLabel' => $areaCol,
                        ]);
                        $areas = [];
                        foreach ($areaEntries as $entry) {
                            $val = $entry->getValue();
                            if ($val !== null && $val !== '') {
                                $areas[] = $val;
                            }
                        }
                        $areas = array_values(array_unique($areas));
                        if (!empty($areas)) {
                            $isisAreas[$d->getId()] = $areas;
                            foreach ($areas as $a) $allIsisAreas[$a] = true;
                        }
                    }
                    break;
                }
            }
        }

        // Enrich nodes with ISIS areas
        if (!empty($isisAreas)) {
            foreach ($nodesPayload as &$np) {
                $np['isisAreas'] = $isisAreas[(int)$np['id']] ?? [];
            }
            unset($np);
        }

        // Build zones payload: merge definitions from designConfig with positions from layout
        $zoneDefs = $designConfig['zones'] ?? [];
        $zonesPayload = array_map(function (array $z) use ($layout) {
            $z['position'] = $layout[$z['id']] ?? null;
            return $z;
        }, $zoneDefs);

        return $this->json([
            'map' => $this->serialize($map, count($devices), count($links)),
            'nodes' => $nodesPayload,
            'edges' => $edgesPayload,
            'zones' => $zonesPayload,
            'availableProtocols' => $protocols,
            'designConfig' => $designConfig,
            'isisAreas' => array_values(array_keys($allIsisAreas)),
        ]);
    }

    /**
     * Update the style override of a specific device.
     */
    #[Route('/{mapId}/devices/{deviceId}/style', methods: ['PUT'])]
    public function updateDeviceStyle(int $mapId, int $deviceId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $device = $em->getRepository(TopologyDevice::class)->find($deviceId);
        if (!$device || $device->getMap()->getId() !== $mapId) {
            return $this->json(['error' => 'Device not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        $device->setStyleOverride($data['styleOverride'] ?? null);
        $em->flush();
        return $this->json(['ok' => true]);
    }

    /**
     * Update the style override of a specific link.
     */
    #[Route('/{mapId}/links/{linkId}/style', methods: ['PUT'])]
    public function updateLinkStyle(int $mapId, int $linkId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $link = $em->getRepository(TopologyLink::class)->find($linkId);
        if (!$link || $link->getMap()->getId() !== $mapId) {
            return $this->json(['error' => 'Link not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        $link->setStyleOverride($data['styleOverride'] ?? null);
        $em->flush();
        return $this->json(['ok' => true]);
    }

    /**
     * Create a manual link between two devices.
     */
    #[Route('/{id}/links', methods: ['POST'])]
    public function createLink(TopologyMap $map, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $sourceDeviceId = $data['sourceDeviceId'] ?? null;
        $targetDeviceId = $data['targetDeviceId'] ?? null;
        $sourcePort = $data['sourcePort'] ?? null;
        $targetPort = $data['targetPort'] ?? null;

        if (!$sourceDeviceId || !$targetDeviceId) {
            return $this->json(['error' => 'sourceDeviceId and targetDeviceId are required'], Response::HTTP_BAD_REQUEST);
        }

        $sourceDevice = $em->getRepository(TopologyDevice::class)->find($sourceDeviceId);
        $targetDevice = $em->getRepository(TopologyDevice::class)->find($targetDeviceId);

        if (!$sourceDevice || $sourceDevice->getMap()->getId() !== $map->getId()) {
            return $this->json(['error' => 'Source device not found on this map'], Response::HTTP_NOT_FOUND);
        }
        if (!$targetDevice || $targetDevice->getMap()->getId() !== $map->getId()) {
            return $this->json(['error' => 'Target device not found on this map'], Response::HTTP_NOT_FOUND);
        }

        $link = new TopologyLink();
        $link->setMap($map);
        $link->setSourceDevice($sourceDevice);
        $link->setTargetDevice($targetDevice);
        $link->setProtocol('manual');
        $link->setSourcePort($sourcePort);
        $link->setTargetPort($targetPort);
        $link->setStatus('up');
        $link->setIsManual(true);
        $em->persist($link);
        $em->flush();

        return $this->json([
            'id' => $link->getId(),
            'sourceDeviceId' => $sourceDevice->getId(),
            'targetDeviceId' => $targetDevice->getId(),
            'protocol' => $link->getProtocol(),
            'sourcePort' => $link->getSourcePort(),
            'targetPort' => $link->getTargetPort(),
            'isManual' => true,
        ], Response::HTTP_CREATED);
    }

    /**
     * Delete a link.
     */
    #[Route('/{mapId}/links/{linkId}', methods: ['DELETE'])]
    public function deleteLink(int $mapId, int $linkId, EntityManagerInterface $em): JsonResponse
    {
        $link = $em->getRepository(TopologyLink::class)->find($linkId);
        if (!$link || $link->getMap()->getId() !== $mapId) {
            return $this->json(['error' => 'Link not found'], Response::HTTP_NOT_FOUND);
        }
        $em->remove($link);
        $em->flush();
        return $this->json(['ok' => true]);
    }

    /**
     * Get available ports and identifiers for a device (from inventory data).
     */
    #[Route('/{mapId}/devices/{deviceId}/ports', methods: ['GET'])]
    public function getDevicePorts(int $mapId, int $deviceId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $device = $em->getRepository(TopologyDevice::class)->find($deviceId);
        if (!$device || $device->getMap()->getId() !== $mapId) {
            return $this->json(['error' => 'Device not found'], Response::HTTP_NOT_FOUND);
        }

        $node = $device->getNode();
        $identifiers = [
            'name' => $device->getName(),
            'chassisId' => $device->getChassisId(),
            'mgmtAddress' => $device->getMgmtAddress(),
        ];
        if ($node) {
            $identifiers['hostname'] = $node->getHostname();
            $identifiers['ipAddress'] = $node->getIpAddress();
        }

        $ports = [];
        if ($node) {
            $categoryId = $request->query->get('categoryId');
            $qb = $em->createQueryBuilder()
                ->select('DISTINCT e.entryKey')
                ->from(NodeInventoryEntry::class, 'e')
                ->where('e.node = :node')
                ->setParameter('node', $node)
                ->orderBy('e.entryKey', 'ASC');

            if ($categoryId) {
                $qb->andWhere('e.category = :cat')->setParameter('cat', $categoryId);
            }

            $ports = array_column($qb->getQuery()->getScalarResult(), 'entryKey');
        }

        return $this->json([
            'deviceId' => $device->getId(),
            'identifiers' => array_filter($identifiers),
            'ports' => $ports,
        ]);
    }
}

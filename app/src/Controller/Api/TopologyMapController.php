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
                // Index by all known identifiers of this node
                if ($node->getName()) $deviceByKey[strtolower($node->getName())] = $d;
                if ($node->getHostname()) $deviceByKey[strtolower($node->getHostname())] = $d;
                if ($node->getIpAddress()) $deviceByKey[strtolower($node->getIpAddress())] = $d;
            }
            // Also index by device name and mgmt address
            $deviceByKey[strtolower($d->getName())] = $d;
            if ($d->getMgmtAddress()) $deviceByKey[strtolower($d->getMgmtAddress())] = $d;
            if ($d->getChassisId()) $deviceByKey[strtolower($d->getChassisId())] = $d;
        }

        $stats = ['linksCreated' => 0, 'linksUpdated' => 0, 'errors' => []];

        foreach ($linkRules as $rule) {
            $protocol = $rule['protocol'] ?? 'lldp';
            $categoryId = $rule['inventoryCategoryId'] ?? null;
            $remoteNameCol = $rule['remoteNameColumn'] ?? null;
            $remotePortCol = $rule['remotePortColumn'] ?? null;
            $chassisCol = $rule['chassisIdColumn'] ?? null;
            $mgmtCol = $rule['mgmtAddressColumn'] ?? null;
            $weightCol = $rule['weightColumn'] ?? null;

            if (!$categoryId || !$remoteNameCol) {
                $stats['errors'][] = 'Missing inventoryCategoryId or remoteNameColumn in rule';
                continue;
            }

            // Delete existing links for this protocol on this map
            $em->createQueryBuilder()
                ->delete(TopologyLink::class, 'l')
                ->where('l.map = :map AND l.protocol = :proto')
                ->setParameter('map', $map)
                ->setParameter('proto', $protocol)
                ->getQuery()
                ->execute();

            // In-memory index to deduplicate bidirectional links (A→B == B→A)
            $createdLinks = []; // "minDeviceId:maxDeviceId:minPort:maxPort" → true

            // For each device that has a node, read its inventory in this category
            foreach ($deviceByNodeId as $nodeId => $sourceDevice) {
                $entries = $em->getRepository(NodeInventoryEntry::class)->findBy([
                    'node' => $sourceDevice->getNode(),
                    'category' => $categoryId,
                ]);

                // Group entries by entryKey (= local port)
                $byKey = [];
                foreach ($entries as $entry) {
                    $byKey[$entry->getEntryKey()][$entry->getColLabel()] = $entry->getValue();
                }

                foreach ($byKey as $localPort => $cols) {
                    $remoteName = $cols[$remoteNameCol] ?? null;
                    if (!$remoteName) continue;

                    $remotePort = $remotePortCol ? ($cols[$remotePortCol] ?? null) : null;
                    $chassisId = $chassisCol ? ($cols[$chassisCol] ?? null) : null;
                    $mgmtAddress = $mgmtCol ? ($cols[$mgmtCol] ?? null) : null;
                    $weight = $weightCol && isset($cols[$weightCol]) && is_numeric($cols[$weightCol]) ? (int) $cols[$weightCol] : null;

                    // Find target device by correlating: name, chassis, IP
                    $targetDevice = $deviceByKey[strtolower($remoteName)] ?? null;
                    if (!$targetDevice && $chassisId) {
                        $targetDevice = $deviceByKey[strtolower($chassisId)] ?? null;
                    }
                    if (!$targetDevice && $mgmtAddress) {
                        $targetDevice = $deviceByKey[strtolower($mgmtAddress)] ?? null;
                    }

                    // Still not found → look up a Node in the context by name/hostname/IP
                    if (!$targetDevice) {
                        $targetNode = null;
                        foreach (['name', 'hostname', 'ipAddress'] as $field) {
                            $targetNode = $em->getRepository(Node::class)->findOneBy([
                                'context' => $context,
                                $field => $remoteName,
                            ]);
                            if ($targetNode) break;
                        }
                        // Also try by mgmt IP
                        if (!$targetNode && $mgmtAddress) {
                            $targetNode = $em->getRepository(Node::class)->findOneBy([
                                'context' => $context,
                                'ipAddress' => $mgmtAddress,
                            ]);
                        }

                        // If we found a known node that already has a device, use it
                        if ($targetNode && isset($deviceByNodeId[$targetNode->getId()])) {
                            $targetDevice = $deviceByNodeId[$targetNode->getId()];
                        } else {
                            // Create a new device (external if no node found)
                            $targetDevice = new TopologyDevice();
                            $targetDevice->setMap($map);
                            $targetDevice->setNode($targetNode);
                            $targetDevice->setName($remoteName);
                            $targetDevice->setChassisId($chassisId);
                            $targetDevice->setMgmtAddress($mgmtAddress);
                            $em->persist($targetDevice);
                            $em->flush();

                            if ($targetNode) {
                                $deviceByNodeId[$targetNode->getId()] = $targetDevice;
                            }
                        }

                        // Index the new device for future lookups
                        $deviceByKey[strtolower($remoteName)] = $targetDevice;
                        if ($chassisId) $deviceByKey[strtolower($chassisId)] = $targetDevice;
                        if ($mgmtAddress) $deviceByKey[strtolower($mgmtAddress)] = $targetDevice;
                    }

                    // Deduplicate bidirectional: canonical key is sorted device IDs + sorted ports
                    $srcId = $sourceDevice->getId();
                    $tgtId = $targetDevice->getId();
                    $minId = min($srcId, $tgtId);
                    $maxId = max($srcId, $tgtId);
                    $portA = ($srcId <= $tgtId) ? ($localPort ?? '') : ($remotePort ?? '');
                    $portB = ($srcId <= $tgtId) ? ($remotePort ?? '') : ($localPort ?? '');
                    $linkKey = "$minId:$maxId:$portA:$portB";

                    if (isset($createdLinks[$linkKey])) {
                        // Already created from the other direction, skip
                        continue;
                    }
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

        $map->setLastRefreshedAt(new \DateTimeImmutable());
        $em->flush();

        return $this->json($stats);
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

        $edgesPayload = array_map(fn(TopologyLink $l) => [
            'id' => (string) $l->getId(),
            'source' => (string) $l->getSourceDevice()->getId(),
            'target' => (string) $l->getTargetDevice()->getId(),
            'protocol' => $l->getProtocol(),
            'sourcePort' => $l->getSourcePort(),
            'targetPort' => $l->getTargetPort(),
            'status' => $l->getStatus(),
            'weight' => $l->getWeight(),
            'metadata' => $l->getMetadata(),
            'styleOverride' => $l->getStyleOverride(),
        ], $links);

        $protocols = array_values(array_unique(array_filter(array_map(fn($l) => $l->getProtocol(), $links))));

        // Build zones payload: merge definitions from designConfig with positions from layout
        $designConfig = $map->getDesignConfig();
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
}

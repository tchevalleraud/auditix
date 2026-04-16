<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\CompliancePolicy;
use App\Entity\ComplianceResult;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Entity\Profile;
use App\Entity\Cve;
use App\Entity\CveDeviceModel;
use App\Service\SystemUpdateScoreCalculator;
use App\Service\VulnerabilityScoreCalculator;
use App\Message\EvaluateComplianceMessage;
use App\Message\PingNodeMessage;
use App\Message\RecalculateNodeScoreMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/nodes')]
class NodeController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    private function serialize(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        $profile = $n->getProfile();
        $context = $n->getContext();

        return [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'hostname' => $n->getHostname(),
            'score' => $n->getScore(),
            'complianceScore' => $n->getComplianceScore(),
            'vulnerabilityScore' => $n->getVulnerabilityScore(),
            'systemUpdateScore' => $n->getSystemUpdateScore(),
            'policy' => $n->getPolicy(),
            'discoveredModel' => $n->getDiscoveredModel(),
            'discoveredVersion' => $n->getDiscoveredVersion(),
            'productModel' => $n->getProductModel(),
            'complianceEvaluating' => $n->getComplianceEvaluating(),
            'isReachable' => $n->getIsReachable(),
            'lastPingAt' => $n->getLastPingAt()?->format('c'),
            'monitoringEnabled' => $context?->isMonitoringEnabled() ?? false,
            'manufacturer' => $manufacturer ? [
                'id' => $manufacturer->getId(),
                'name' => $manufacturer->getName(),
                'logo' => $manufacturer->getLogo(),
            ] : null,
            'model' => $model ? [
                'id' => $model->getId(),
                'name' => $model->getName(),
            ] : null,
            'profile' => $profile ? [
                'id' => $profile->getId(),
                'name' => $profile->getName(),
            ] : null,
            'tags' => $n->getTags()->map(fn(NodeTag $t) => [
                'id' => $t->getId(),
                'name' => $t->getName(),
                'color' => $t->getColor(),
            ])->toArray(),
            'createdAt' => $n->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $nodes = $em->getRepository(Node::class)->findBy(
            ['context' => $contextId],
            ['ipAddress' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $nodes));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $ipAddress = $data['ipAddress'] ?? '';
        if (empty($ipAddress)) {
            return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
        }

        $node = new Node();
        $node->setContext($context);
        $node->setName($data['name'] ?? null);
        $node->setIpAddress($ipAddress);
        $node->setPolicy($data['policy'] ?? 'audit');

        if (!empty($data['manufacturerId'])) {
            $node->setManufacturer($em->getRepository(Editor::class)->find($data['manufacturerId']));
        }
        if (!empty($data['modelId'])) {
            $node->setModel($em->getRepository(DeviceModel::class)->find($data['modelId']));
        }
        if (!empty($data['profileId'])) {
            $node->setProfile($em->getRepository(Profile::class)->find($data['profileId']));
        }

        $em->persist($node);
        $em->flush();

        if ($context->isMonitoringEnabled()) {
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        return $this->json($this->serialize($node), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (array_key_exists('ipAddress', $data)) {
            $ipAddress = $data['ipAddress'] ?? '';
            if (empty($ipAddress)) {
                return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
            }
            $node->setIpAddress($ipAddress);
        }
        if (array_key_exists('name', $data)) {
            $node->setName($data['name']);
        }
        if (array_key_exists('policy', $data)) {
            $node->setPolicy($data['policy']);
        }
        if (array_key_exists('manufacturerId', $data)) {
            $node->setManufacturer($data['manufacturerId'] ? $em->getRepository(Editor::class)->find($data['manufacturerId']) : null);
        }
        if (array_key_exists('modelId', $data)) {
            $node->setModel($data['modelId'] ? $em->getRepository(DeviceModel::class)->find($data['modelId']) : null);
        }
        if (array_key_exists('profileId', $data)) {
            $node->setProfile($data['profileId'] ? $em->getRepository(Profile::class)->find($data['profileId']) : null);
        }
        if (array_key_exists('tagIds', $data)) {
            $tagMode = $data['tagMode'] ?? 'replace';
            if ($tagMode === 'replace') {
                foreach ($node->getTags()->toArray() as $tag) { $node->removeTag($tag); }
            }
            foreach (($data['tagIds'] ?? []) as $tagId) {
                $tag = $em->getRepository(NodeTag::class)->find($tagId);
                if ($tag) $node->addTag($tag);
            }
        }

        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/tags', methods: ['POST'])]
    public function addTag(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $tagId = $data['tagId'] ?? null;
        if (!$tagId) return $this->json(['error' => 'tagId is required'], Response::HTTP_BAD_REQUEST);

        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if (!$tag) return $this->json(['error' => 'Tag not found'], Response::HTTP_NOT_FOUND);

        $node->addTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/{id}/tags/{tagId}', methods: ['DELETE'])]
    public function removeTag(Node $node, int $tagId, EntityManagerInterface $em): JsonResponse
    {
        $tag = $em->getRepository(NodeTag::class)->find($tagId);
        if ($tag) $node->removeTag($tag);
        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/ping', methods: ['POST'])]
    public function ping(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);

        foreach ($nodes as $node) {
            $node->setIsReachable(null);
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        $em->flush();

        return $this->json(['dispatched' => count($nodes)]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Node $node, EntityManagerInterface $em): JsonResponse
    {
        // Delete collection storage files
        $collections = $em->getRepository(Collection::class)->findBy(['node' => $node]);
        foreach ($collections as $collection) {
            $storageDir = $this->projectDir . '/var/' . $collection->getStoragePath();
            $this->deleteDirectory($storageDir);
        }

        $em->remove($node);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) return;
        $items = scandir($dir);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = $dir . '/' . $item;
            if (is_dir($path)) {
                $this->deleteDirectory($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
    }

    #[Route('/{id}/inventory', methods: ['GET'])]
    public function inventory(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $entries = $em->getRepository(NodeInventoryEntry::class)->findBy(
            ['node' => $node],
            ['categoryName' => 'ASC', 'entryKey' => 'ASC', 'colLabel' => 'ASC']
        );

        // Group by category → key → colLabel
        $categories = [];
        foreach ($entries as $entry) {
            $catName = $entry->getCategoryName();
            $catId = $entry->getCategory()?->getId();
            $catKeyLabel = $entry->getCategory()?->getKeyLabel();
            $catKey = $catId ? (string)$catId : '__' . $catName;

            if (!isset($categories[$catKey])) {
                $categories[$catKey] = [
                    'categoryName' => $catName,
                    'keyLabel' => $catKeyLabel,
                    'columns' => [],
                    'rows' => [],
                    'columnSet' => [],
                ];
            }

            $key = $entry->getEntryKey();
            $label = $entry->getColLabel();

            // Track columns
            if (!in_array($label, $categories[$catKey]['columnSet'], true)) {
                $categories[$catKey]['columnSet'][] = $label;
                $categories[$catKey]['columns'][] = ['colKey' => 'col:' . $label, 'label' => $label];
            }

            // Build rows
            if (!isset($categories[$catKey]['rows'][$key])) {
                $categories[$catKey]['rows'][$key] = ['key' => $key, 'values' => []];
            }
            $categories[$catKey]['rows'][$key]['values']['col:' . $label] = $entry->getValue();
        }

        // Convert to indexed arrays with natural sort on keys
        $result = [];
        foreach ($categories as $cat) {
            unset($cat['columnSet']);
            $rows = array_values($cat['rows']);
            usort($rows, fn($a, $b) => strnatcmp($a['key'], $b['key']));
            $cat['rows'] = $rows;
            $result[] = $cat;
        }

        return $this->json($result);
    }

    #[Route('/evaluate-compliance', methods: ['POST'])]
    public function evaluateComplianceBulk(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $dispatched = 0;

        foreach ($nodes as $node) {
            $policies = $em->createQuery(
                'SELECT p FROM App\Entity\CompliancePolicy p JOIN p.nodes n WHERE n = :node AND p.enabled = true'
            )->setParameter('node', $node)->getResult();

            if (empty($policies)) {
                // No compliance policies — still recalculate vulnerability score only
                $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
                continue;
            }

            foreach ($policies as $policy) {
                $this->bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
                $dispatched++;
            }

            $node->setScore(null);
            $node->setComplianceEvaluating('pending');
        }

        $em->flush();

        return $this->json(['dispatched' => $dispatched]);
    }

    #[Route('/{id}/evaluate-compliance', methods: ['POST'])]
    public function evaluateCompliance(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $policies = $em->createQuery(
            'SELECT p FROM App\Entity\CompliancePolicy p JOIN p.nodes n WHERE n = :node AND p.enabled = true'
        )->setParameter('node', $node)->getResult();

        $dispatched = 0;
        foreach ($policies as $policy) {
            $this->bus->dispatch(new EvaluateComplianceMessage($policy->getId(), $node->getId()));
            $dispatched++;
        }

        if ($dispatched > 0) {
            $node->setScore(null);
            $node->setComplianceEvaluating('pending');
        } else {
            // No compliance policies — still recalculate vulnerability score only
            $this->bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
        }
        $em->flush();

        return $this->json(['dispatched' => $dispatched]);
    }

    #[Route('/compliance-stats', methods: ['GET'])]
    public function complianceStats(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $nodes = $em->getRepository(Node::class)->findBy(['context' => $contextId]);
        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

        if (empty($nodeIds)) return $this->json(new \stdClass());

        $results = $em->getRepository(ComplianceResult::class)->findBy(['node' => $nodeIds]);

        $stats = [];
        foreach ($results as $r) {
            $nId = $r->getNode()->getId();
            $status = $r->getStatus();
            if ($status === 'skipped') continue;

            if (!isset($stats[$nId])) {
                $stats[$nId] = ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0];
            }
            if (isset($stats[$nId][$status])) {
                $stats[$nId][$status]++;
            }
        }

        return $this->json($stats);
    }

    #[Route('/{id}/vulnerabilities', methods: ['GET'])]
    public function vulnerabilities(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $model = $node->getModel();
        $context = $node->getContext();

        if (!$model || !$context) {
            return $this->json([
                'vulnerabilityScore' => null,
                'cves' => [],
                'stats' => ['total' => 0, 'bySeverity' => []],
            ]);
        }

        // Get CVEs affecting this node's model
        $cves = $em->createQuery(
            'SELECT c FROM App\Entity\Cve c
             JOIN App\Entity\CveDeviceModel cdm WITH cdm.cve = c
             WHERE cdm.deviceModel = :model AND c.context = :ctx
             ORDER BY c.cvssScore DESC'
        )->setParameter('model', $model)->setParameter('ctx', $context)->getResult();

        $nodeVersion = $node->getDiscoveredVersion();
        $bySeverity = [];
        $items = [];
        foreach ($cves as $cve) {
            $sev = $cve->getSeverity();
            $affected = true;
            if ($nodeVersion) {
                $affected = VulnerabilityScoreCalculator::isVersionAffected($nodeVersion, [
                    'version_start_including' => $cve->getVersionStartIncluding(),
                    'version_end_excluding' => $cve->getVersionEndExcluding(),
                    'version_end_including' => $cve->getVersionEndIncluding(),
                ]);
            }
            if (!$affected) {
                continue;
            }
            $bySeverity[$sev] = ($bySeverity[$sev] ?? 0) + 1;
            $items[] = [
                'id' => $cve->getId(),
                'cveId' => $cve->getCveId(),
                'description' => $cve->getDescription(),
                'cvssScore' => $cve->getCvssScore(),
                'cvssVector' => $cve->getCvssVector(),
                'severity' => $sev,
                'publishedAt' => $cve->getPublishedAt()?->format('c'),
            ];
        }

        return $this->json([
            'vulnerabilityScore' => $node->getVulnerabilityScore(),
            'cves' => $items,
            'stats' => [
                'total' => count($cves),
                'bySeverity' => $bySeverity,
            ],
        ]);
    }

    #[Route('/{id}/compliance', methods: ['GET'])]
    public function compliance(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $results = $em->getRepository(ComplianceResult::class)->findBy(
            ['node' => $node],
        );

        // Group by policy
        $policyMap = [];
        foreach ($results as $r) {
            $p = $r->getPolicy();
            $pId = $p->getId();
            if (!isset($policyMap[$pId])) {
                $policyMap[$pId] = [
                    'policy' => [
                        'id' => $p->getId(),
                        'name' => $p->getName(),
                    ],
                    'results' => [],
                    'stats' => ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0, 'skipped' => 0],
                    'evaluatedAt' => null,
                ];
            }

            $status = $r->getStatus();

            // Skip disabled rules (skipped status)
            if ($status === 'skipped') {
                continue;
            }

            $rule = $r->getRule();
            $policyMap[$pId]['results'][] = [
                'ruleId' => $rule->getId(),
                'ruleIdentifier' => $rule->getIdentifier(),
                'ruleName' => $rule->getName(),
                'ruleDescription' => $rule->getDescription(),
                'status' => $r->getStatus(),
                'severity' => $r->getSeverity(),
                'message' => $r->getMessage(),
                'evaluatedAt' => $r->getEvaluatedAt()->format('c'),
            ];

            if (isset($policyMap[$pId]['stats'][$status])) {
                $policyMap[$pId]['stats'][$status]++;
            }

            $evalAt = $r->getEvaluatedAt()->format('c');
            if (!$policyMap[$pId]['evaluatedAt'] || $evalAt > $policyMap[$pId]['evaluatedAt']) {
                $policyMap[$pId]['evaluatedAt'] = $evalAt;
            }
        }

        // Sort results by rule identifier (natural sort)
        foreach ($policyMap as &$entry) {
            usort($entry['results'], function ($a, $b) {
                return strnatcasecmp($a['ruleIdentifier'] ?? '', $b['ruleIdentifier'] ?? '') ?: strcmp($a['ruleName'], $b['ruleName']);
            });
        }
        unset($entry);

        return $this->json([
            'score' => $node->getComplianceScore(),
            'policies' => array_values($policyMap),
        ]);
    }

    #[Route('/{id}/system-updates', methods: ['GET'])]
    public function systemUpdates(Node $node, SystemUpdateScoreCalculator $calculator): JsonResponse
    {
        $result = $calculator->calculateForNode($node);
        $productRange = $calculator->findProductRange($node);

        return $this->json([
            'systemUpdateScore' => $node->getSystemUpdateScore(),
            'calculatedScore' => $result['score'],
            'calculatedGrade' => $result['grade'],
            'details' => $result['details'],
            'productRange' => $productRange ? [
                'id' => $productRange->getId(),
                'name' => $productRange->getName(),
                'recommendedVersion' => $productRange->getRecommendedVersion(),
                'currentVersion' => $productRange->getCurrentVersion(),
                'releaseDate' => $productRange->getReleaseDate()?->format('c'),
                'endOfSaleDate' => $productRange->getEndOfSaleDate()?->format('c'),
                'endOfSupportDate' => $productRange->getEndOfSupportDate()?->format('c'),
                'endOfLifeDate' => $productRange->getEndOfLifeDate()?->format('c'),
                'pluginSource' => $productRange->getPluginSource(),
                'lastSyncedAt' => $productRange->getLastSyncedAt()?->format('c'),
            ] : null,
            'productModel' => $node->getProductModel(),
            'discoveredVersion' => $node->getDiscoveredVersion(),
        ]);
    }
}

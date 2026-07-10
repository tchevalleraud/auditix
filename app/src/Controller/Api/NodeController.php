<?php

namespace App\Controller\Api;

use App\Doctrine\Filter\LatestInventoryFilter;
use App\Entity\Collection;
use App\Entity\CollectionTag;
use App\Entity\CompliancePolicy;
use App\Entity\ComplianceResult;
use App\Entity\EnforceResult;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\Node;
use App\Entity\NodeDynamicTag;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Entity\Profile;
use App\Entity\Cve;
use App\Entity\CveDeviceModel;
use App\Entity\ProductRange;
use App\Service\InventoryNodeRuleEvaluator;
use App\Security\Voter\ContextAccessVoter;
use App\Service\PolicyAutoAssigner;
use App\Service\StackResolver;
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
        private readonly EntityManagerInterface $em,
    ) {}

    private function serialize(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        $profile = $n->getProfile();
        $context = $n->getContext();

        $dynamicTags = $this->em->getRepository(NodeDynamicTag::class)->findBy(['node' => $n]);

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
            'enforcing' => $n->getEnforcing(),
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
            'dynamicTags' => array_map(fn(NodeDynamicTag $d) => [
                'id' => $d->getTag()->getId(),
                'name' => $d->getTag()->getName(),
                'color' => $d->getTag()->getColor(),
                'ruleId' => $d->getRule()?->getId(),
                'ruleName' => $d->getRule()?->getName(),
            ], $dynamicTags),
            'createdAt' => $n->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) return $this->json([]);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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
            // An enforce run only makes sense for enforce-policy nodes. Flipping
            // back to audit clears any pending/running flag so the UI doesn't
            // keep showing "Enforcing..." for a node that can't be enforced.
            if ($data['policy'] !== 'enforce' && $node->getEnforcing() !== null) {
                $node->setEnforcing(null);
            }
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
            $node->setIsReachable(null);
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        $em->flush();

        return $this->json(['dispatched' => count($nodes)]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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

    #[Route('/{id}/acl', methods: ['GET'])]
    public function acl(Node $node, \App\Service\AclExtractor $aclExtractor): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);

        $acls = $aclExtractor->extractForNode($node, $node->getContext()?->getAclConfig());

        return $this->json(['acls' => $acls]);
    }

    #[Route('/{id}/stack', methods: ['GET'])]
    public function stack(Node $node, StackResolver $stackResolver, SystemUpdateScoreCalculator $calculator): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);

        $context = $node->getContext();
        $units = [];
        foreach ($stackResolver->resolveUnits($node, $context?->getStackConfig()) as $u) {
            $range = $calculator->findProductRangeForModel($u->model, $u->version, $context);
            $calc = $calculator->calculateForModel($u->version, $range);
            $units[] = [
                'key' => $u->key,
                'serial' => $u->serial,
                'model' => $u->model,
                'version' => $u->version,
                'implicit' => $u->implicit,
                'columns' => $u->columns,
                'grade' => $calc['grade'],
                'score' => $calc['score'],
                'productRange' => $this->serializeProductRange($range),
            ];
        }

        return $this->json(['units' => $units]);
    }

    private function serializeProductRange(?ProductRange $pr): ?array
    {
        if (!$pr) {
            return null;
        }
        return [
            'id' => $pr->getId(),
            'name' => $pr->getName(),
            'recommendedVersion' => $pr->getRecommendedVersion(),
            'currentVersion' => $pr->getCurrentVersion(),
            'releaseDate' => $pr->getReleaseDate()?->format('c'),
            'endOfSaleDate' => $pr->getEndOfSaleDate()?->format('c'),
            'endOfSupportDate' => $pr->getEndOfSupportDate()?->format('c'),
            'endOfLifeDate' => $pr->getEndOfLifeDate()?->format('c'),
            'pluginSource' => $pr->getPluginSource(),
            'lastSyncedAt' => $pr->getLastSyncedAt()?->format('c'),
        ];
    }

    #[Route('/{id}/inventory/tags', methods: ['GET'])]
    public function inventoryTags(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
        $tags = $em->getRepository(CollectionTag::class)->findByNode($node);

        return $this->json(array_map(function (CollectionTag $t) {
            $col = $t->getCollection();
            return [
                'id' => $t->getId(),
                'name' => $t->getName(),
                'createdAt' => $t->getCreatedAt()->format('c'),
                'collection' => [
                    'id' => $col->getId(),
                    'status' => $col->getStatus(),
                    'completedAt' => $col->getCompletedAt()?->format('c'),
                    'lastExtractedAt' => $col->getLastExtractedAt()?->format('c'),
                ],
            ];
        }, $tags));
    }

    #[Route('/{id}/inventory', methods: ['GET'])]
    public function inventory(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
        $tagName = trim((string) $request->query->get('tag', 'latest'));
        if ($tagName === '') $tagName = 'latest';

        $tag = $em->getRepository(CollectionTag::class)->findOneByNodeAndName($node, $tagName);
        if (!$tag) {
            return $this->json([]);
        }

        // Bypass the global "latest only" filter: this endpoint scopes by the
        // explicitly requested CollectionTag, which may be a historical snapshot.
        $filters = $em->getFilters();
        $hadFilter = $filters->isEnabled(LatestInventoryFilter::NAME);
        if ($hadFilter) $filters->disable(LatestInventoryFilter::NAME);

        try {
            $entries = $em->getRepository(NodeInventoryEntry::class)->findBy(
                ['collectionTag' => $tag],
                ['categoryName' => 'ASC', 'entryKey' => 'ASC', 'colLabel' => 'ASC']
            );
        } finally {
            if ($hadFilter) $filters->enable(LatestInventoryFilter::NAME);
        }

        // Group by category → key → colLabel
        $categories = [];
        foreach ($entries as $entry) {
            $catName = $entry->getCategoryName();
            $cat = $entry->getCategory();
            $catId = $cat?->getId();
            $catKeyLabel = $cat?->getKeyLabel();
            $catColumnConfig = $cat?->getColumnConfig();
            $catKey = $catId ? (string)$catId : '__' . $catName;

            if (!isset($categories[$catKey])) {
                $categories[$catKey] = [
                    'categoryName' => $catName,
                    'keyLabel' => $catKeyLabel,
                    'columnConfig' => $catColumnConfig,
                    'sortConfig' => $cat?->getSortConfig(),
                    'discoveredColumns' => [],
                    'rows' => [],
                ];
            }

            $key = $entry->getEntryKey();
            $label = $entry->getColLabel();

            if (!in_array($label, $categories[$catKey]['discoveredColumns'], true)) {
                $categories[$catKey]['discoveredColumns'][] = $label;
            }

            if (!isset($categories[$catKey]['rows'][$key])) {
                $categories[$catKey]['rows'][$key] = ['key' => $key, 'values' => []];
            }
            $categories[$catKey]['rows'][$key]['values']['col:' . $label] = $entry->getValue();
        }

        // Build ordered columns list (config first, then unconfigured discovered) with visibility flag
        $result = [];
        foreach ($categories as $cat) {
            $columns = [];
            $known = [];
            foreach (($cat['columnConfig'] ?? []) as $item) {
                $label = $item['label'] ?? null;
                if (!is_string($label) || $label === '' || isset($known[$label])) {
                    continue;
                }
                $known[$label] = true;
                $columns[] = [
                    'colKey' => 'col:' . $label,
                    'label' => $label,
                    'visible' => !isset($item['visible']) || (bool)$item['visible'],
                ];
            }
            foreach ($cat['discoveredColumns'] as $label) {
                if (isset($known[$label])) {
                    continue;
                }
                $known[$label] = true;
                $columns[] = ['colKey' => 'col:' . $label, 'label' => $label, 'visible' => true];
            }

            $rows = array_values($cat['rows']);
            $sortColumn = null;
            $sortDirection = 'asc';
            if (is_array($cat['sortConfig'] ?? null)) {
                $rawCol = $cat['sortConfig']['column'] ?? null;
                if (is_string($rawCol) && $rawCol !== '') {
                    $sortColumn = $rawCol;
                }
                $rawDir = $cat['sortConfig']['direction'] ?? null;
                if (is_string($rawDir) && strtolower($rawDir) === 'desc') {
                    $sortDirection = 'desc';
                }
            }

            if ($sortColumn !== null) {
                $sortKey = 'col:' . $sortColumn;
                usort($rows, function ($a, $b) use ($sortKey) {
                    $av = $a['values'][$sortKey] ?? '';
                    $bv = $b['values'][$sortKey] ?? '';
                    return strnatcmp((string)$av, (string)$bv);
                });
            } else {
                usort($rows, fn($a, $b) => strnatcmp($a['key'], $b['key']));
            }

            if ($sortDirection === 'desc') {
                $rows = array_reverse($rows);
            }

            $result[] = [
                'categoryName' => $cat['categoryName'],
                'keyLabel' => $cat['keyLabel'],
                'columns' => $columns,
                'rows' => $rows,
            ];
        }

        return $this->json($result);
    }

    #[Route('/evaluate-compliance', methods: ['POST'])]
    public function evaluateComplianceBulk(Request $request, EntityManagerInterface $em, PolicyAutoAssigner $autoAssigner): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $dispatched = 0;

        foreach ($nodes as $node) {
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
            $policies = $autoAssigner->autoAssign($node);

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
    public function evaluateCompliance(Node $node, EntityManagerInterface $em, PolicyAutoAssigner $autoAssigner): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
        $policies = $autoAssigner->autoAssign($node);

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

    #[Route('/{id}/enforce-results', methods: ['GET'])]
    public function enforceResults(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);

        $results = $em->getRepository(EnforceResult::class)->findRecentByNode($node, 200);

        return $this->json(array_map(function (EnforceResult $r) {
            $rule = $r->getRule();
            $policy = $r->getPolicy();
            return [
                'id' => $r->getId(),
                'rule' => $rule ? ['id' => $rule->getId(), 'name' => $rule->getName()] : null,
                'policy' => $policy ? ['id' => $policy->getId(), 'name' => $policy->getName()] : null,
                'command' => $r->getCommand(),
                'output' => $r->getOutput(),
                'status' => $r->getStatus(),
                'attempts' => $r->getAttempts(),
                'error' => $r->getError(),
                'executedAt' => $r->getExecutedAt()->format('c'),
            ];
        }, $results));
    }

    #[Route('/compliance-stats', methods: ['GET'])]
    public function complianceStats(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) return $this->json([]);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $nodes = $em->getRepository(Node::class)->findBy(['context' => $contextId]);
        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

        if (empty($nodeIds)) return $this->json(new \stdClass());

        $results = $em->createQueryBuilder()
            ->select('cr')
            ->from(ComplianceResult::class, 'cr')
            ->innerJoin('cr.policy', 'p')
            ->where('cr.node IN (:nodes)')
            ->andWhere('p.enabled = true')
            ->setParameter('nodes', $nodeIds)
            ->getQuery()->getResult();

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
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
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
                'total' => count($items),
                'bySeverity' => $bySeverity,
            ],
        ]);
    }

    #[Route('/{id}/compliance', methods: ['GET'])]
    public function compliance(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
        $results = $em->createQueryBuilder()
            ->select('cr')
            ->from(ComplianceResult::class, 'cr')
            ->innerJoin('cr.policy', 'p')
            ->where('cr.node = :node')
            ->andWhere('p.enabled = true')
            ->setParameter('node', $node)
            ->getQuery()->getResult();

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
                'messageLong' => $r->getMessageLong(),
                'recommendation' => $r->getRecommendation(),
                'recommendationType' => $r->getRecommendationType(),
                'evaluatedAt' => $r->getEvaluatedAt()->format('c'),
                'perKey' => $r->isPerKey(),
                'itemsTotal' => $r->getItemsTotal(),
                'itemsNonCompliant' => $r->getItemsNonCompliant(),
                'items' => $r->isPerKey() ? array_map(static fn ($it) => [
                    'itemKey' => $it->getItemKey(),
                    'status' => $it->getStatus(),
                    'severity' => $it->getSeverity(),
                    'message' => $it->getMessage(),
                ], $r->getItems()->toArray()) : [],
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

    /**
     * Bulk extras endpoint: returns enriched per-node data needed by configurable
     * columns (numeric scores, penalties, CVE counts by severity, system update
     * lifecycle info, optional inventory cell values).
     *
     * Query params:
     *   - context (required, int)
     *   - fields (optional, comma list): compliance, vulnerability, systemUpdate, inventory
     *   - inventoryColumns (optional, JSON array): [{"category":"X","key":"Y","column":"Z"}, ...]
     *     The "key" entry is optional; when omitted or empty, all keys for that
     *     category+column are aggregated.
     */
    #[Route('/extras', methods: ['GET'])]
    public function extras(
        Request $request,
        EntityManagerInterface $em,
        SystemUpdateScoreCalculator $suCalc,
        VulnerabilityScoreCalculator $vulnCalc,
    ): JsonResponse {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json(new \stdClass());

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) return $this->json(new \stdClass());
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $fieldsRaw = $request->query->get('fields', 'compliance,vulnerability,systemUpdate');
        $fields = array_filter(array_map('trim', explode(',', $fieldsRaw)));
        $want = array_flip($fields);

        $nodes = $em->getRepository(Node::class)->findBy(['context' => $contextId]);
        if (empty($nodes)) return $this->json(new \stdClass());

        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);
        $byId = [];
        foreach ($nodeIds as $id) {
            $byId[$id] = [];
        }

        $gradeNumeric = ['A' => 95.0, 'B' => 82.5, 'C' => 67.5, 'D' => 52.5, 'E' => 37.5, 'F' => 15.0];

        // Compliance: count results by status per node
        if (isset($want['compliance'])) {
            $rows = $em->getConnection()->fetchAllAssociative(
                'SELECT cr.node_id AS nid, cr.status, COUNT(*) AS cnt
                 FROM compliance_result cr
                 INNER JOIN compliance_policy cp ON cp.id = cr.policy_id
                 WHERE cr.node_id IN (:ids) AND cr.status <> :skipped AND cp.enabled = true
                 GROUP BY cr.node_id, cr.status',
                ['ids' => $nodeIds, 'skipped' => 'skipped'],
                ['ids' => \Doctrine\DBAL\ArrayParameterType::INTEGER]
            );

            $stats = [];
            foreach ($rows as $r) {
                $nid = (int) $r['nid'];
                if (!isset($stats[$nid])) {
                    $stats[$nid] = ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0];
                }
                if (isset($stats[$nid][$r['status']])) {
                    $stats[$nid][$r['status']] = (int) $r['cnt'];
                }
            }

            foreach ($nodes as $node) {
                $nid = $node->getId();
                $s = $stats[$nid] ?? null;
                if ($s) {
                    $total = $s['compliant'] + $s['non_compliant'] + $s['error'] + $s['not_applicable'];
                    $penalty = $s['non_compliant'] + $s['error'];
                    $numeric = $total > 0 ? round(($s['compliant'] / $total) * 100, 1) : null;
                } else {
                    $penalty = 0;
                    $numeric = null;
                }
                $byId[$nid]['compliancePenalty'] = $penalty;
                $byId[$nid]['complianceScoreNumeric'] = $numeric;
                $byId[$nid]['complianceCounts'] = $s ?? ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0];
            }
        }

        // Vulnerability: per-node CVE counts by severity + penalty
        if (isset($want['vulnerability'])) {
            foreach ($nodes as $node) {
                $nid = $node->getId();
                if (!$node->getModel()) {
                    $byId[$nid]['vulnerability'] = [
                        'total' => 0,
                        'bySeverity' => [],
                        'penalty' => 0,
                        'numeric' => null,
                    ];
                    continue;
                }
                $r = $vulnCalc->calculateForNode($node);
                $byId[$nid]['vulnerability'] = [
                    'total' => $r['cveCount'],
                    'bySeverity' => $r['bySeverity'],
                    'penalty' => $r['penaltySum'],
                    'numeric' => max(0.0, 100.0 - $r['penaltySum']),
                ];
            }
        }

        // System update: lifecycle + recommended version
        if (isset($want['systemUpdate'])) {
            foreach ($nodes as $node) {
                $nid = $node->getId();
                $range = $suCalc->findProductRange($node);
                $r = $suCalc->calculateForNode($node);
                $byId[$nid]['systemUpdate'] = [
                    'recommendedVersion' => $range?->getRecommendedVersion(),
                    'releaseDate' => $range?->getReleaseDate()?->format('c'),
                    'endOfSaleDate' => $range?->getEndOfSaleDate()?->format('c'),
                    'endOfSupportDate' => $range?->getEndOfSupportDate()?->format('c'),
                    'endOfLifeDate' => $range?->getEndOfLifeDate()?->format('c'),
                    'numeric' => $r['score'],
                ];
            }
        }

        // Global score numeric: derived from letter
        foreach ($nodes as $node) {
            $nid = $node->getId();
            $byId[$nid]['scoreNumeric'] = $node->getScore() ? ($gradeNumeric[$node->getScore()] ?? null) : null;
            $byId[$nid]['vulnerabilityScoreNumeric'] = $byId[$nid]['vulnerabilityScoreNumeric']
                ?? ($node->getVulnerabilityScore() ? ($gradeNumeric[$node->getVulnerabilityScore()] ?? null) : null);
            $byId[$nid]['systemUpdateScoreNumeric'] = $byId[$nid]['systemUpdateScoreNumeric']
                ?? ($node->getSystemUpdateScore() ? ($gradeNumeric[$node->getSystemUpdateScore()] ?? null) : null);
        }

        // Inventory: parameterized columns
        if (isset($want['inventory'])) {
            $invRaw = $request->query->get('inventoryColumns');
            $invCols = $invRaw ? json_decode($invRaw, true) : [];
            if (is_array($invCols) && !empty($invCols)) {
                $byColKey = [];
                foreach ($invCols as $c) {
                    if (!is_array($c)) continue;
                    $cat = $c['category'] ?? null;
                    $col = $c['column'] ?? null;
                    $key = isset($c['key']) && is_string($c['key']) ? $c['key'] : '';
                    if (!is_string($cat) || !is_string($col)) continue;
                    $cacheKey = $cat . '||' . $key . '||' . $col;
                    $byColKey[$cacheKey] = ['category' => $cat, 'key' => $key, 'column' => $col];
                }

                if (!empty($byColKey)) {
                    $catNames = array_unique(array_column($byColKey, 'category'));
                    $colLabels = array_unique(array_column($byColKey, 'column'));
                    $rows = $em->getConnection()->fetchAllAssociative(
                        "SELECT e.node_id AS nid, e.category_name, e.col_label, e.entry_key, e.value
                         FROM node_inventory_entry e
                         INNER JOIN collection_tag ct ON ct.id = e.collection_tag_id
                         WHERE e.node_id IN (:ids)
                           AND ct.name = 'latest'
                           AND e.category_name IN (:cats)
                           AND e.col_label IN (:cols)",
                        [
                            'ids' => $nodeIds,
                            'cats' => array_values($catNames),
                            'cols' => array_values($colLabels),
                        ],
                        [
                            'ids' => \Doctrine\DBAL\ArrayParameterType::INTEGER,
                            'cats' => \Doctrine\DBAL\ArrayParameterType::STRING,
                            'cols' => \Doctrine\DBAL\ArrayParameterType::STRING,
                        ]
                    );

                    $perNodeInv = [];
                    foreach ($rows as $r) {
                        $nid = (int) $r['nid'];
                        $exactKey = $r['category_name'] . '||' . $r['entry_key'] . '||' . $r['col_label'];
                        $allKey = $r['category_name'] . '||||' . $r['col_label'];
                        foreach ([$exactKey, $allKey] as $k) {
                            if (!isset($byColKey[$k])) continue;
                            if (!isset($perNodeInv[$nid])) $perNodeInv[$nid] = [];
                            if (!isset($perNodeInv[$nid][$k])) $perNodeInv[$nid][$k] = [];
                            $perNodeInv[$nid][$k][] = $r['value'];
                        }
                    }

                    foreach ($nodes as $node) {
                        $nid = $node->getId();
                        $byId[$nid]['inventory'] = $perNodeInv[$nid] ?? new \stdClass();
                    }
                }
            }
        }

        return $this->json($byId);
    }

    #[Route('/{id}/system-updates', methods: ['GET'])]
    public function systemUpdates(Node $node, SystemUpdateScoreCalculator $calculator): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);
        $unitsResult = $calculator->calculateForUnits($node);
        $result = $unitsResult['composite'];
        $productRange = $calculator->findProductRange($node);

        return $this->json([
            'systemUpdateScore' => $node->getSystemUpdateScore(),
            'calculatedScore' => $result['score'],
            'calculatedGrade' => $result['grade'],
            'details' => $result['details'],
            'productRange' => $this->serializeProductRange($productRange),
            'productModel' => $node->getProductModel(),
            'discoveredVersion' => $node->getDiscoveredVersion(),
            // Per-unit lifecycle breakdown (a plain node has a single implicit unit).
            'units' => $unitsResult['units'],
        ]);
    }

    #[Route('/match', methods: ['POST'])]
    public function matchNodes(Request $request, EntityManagerInterface $em, InventoryNodeRuleEvaluator $evaluator): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            $body = json_decode($request->getContent(), true) ?? [];
            $contextId = (int) ($body['context'] ?? 0);
        }
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['nodeIds' => []]);
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $data = json_decode($request->getContent(), true) ?? [];
        $rules = is_array($data['rules'] ?? null) ? $data['rules'] : [];
        $match = ($data['match'] ?? 'any') === 'all' ? 'all' : 'any';

        $ids = $evaluator->matchNodeIds($context, $rules, $match);
        return $this->json(['nodeIds' => $ids]);
    }
}

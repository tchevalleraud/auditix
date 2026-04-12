<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\Context;
use App\Service\ComplianceEvaluator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/contexts/{id}/dashboard')]
class DashboardController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Context $context, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $context->getId();

        // --- Nodes ---
        $nodeTotal = (int) $em->createQuery('SELECT COUNT(n) FROM App\Entity\Node n WHERE n.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        $nodeReachable = (int) $em->createQuery('SELECT COUNT(n) FROM App\Entity\Node n WHERE n.context = :ctx AND n.isReachable = true')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        $nodeUnreachable = (int) $em->createQuery('SELECT COUNT(n) FROM App\Entity\Node n WHERE n.context = :ctx AND n.isReachable = false')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        $nodeUnknown = $nodeTotal - $nodeReachable - $nodeUnreachable;

        // Nodes by manufacturer (top 5)
        $nodesByManufacturer = $em->createQuery(
            'SELECT e.name AS name, COUNT(n) AS total FROM App\Entity\Node n JOIN n.manufacturer e WHERE n.context = :ctx GROUP BY e.name ORDER BY total DESC'
        )->setParameter('ctx', $contextId)->setMaxResults(5)->getResult();

        // --- Collections ---
        $collectionTotal = (int) $em->createQuery('SELECT COUNT(c) FROM App\Entity\Collection c WHERE c.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        $collectionByStatus = $em->createQuery(
            'SELECT c.status AS status, COUNT(c) AS total FROM App\Entity\Collection c WHERE c.context = :ctx GROUP BY c.status'
        )->setParameter('ctx', $contextId)->getResult();

        $collectionStatusMap = [];
        foreach ($collectionByStatus as $row) {
            $collectionStatusMap[$row['status']] = (int) $row['total'];
        }

        // Recent collections (last 10)
        $recentCollections = $em->createQuery(
            'SELECT c.id, c.status, c.commandCount, c.completedCount, c.createdAt, c.startedAt, c.completedAt, c.error, n.ipAddress AS nodeIp, n.name AS nodeName
             FROM App\Entity\Collection c JOIN c.node n
             WHERE c.context = :ctx ORDER BY c.createdAt DESC'
        )->setParameter('ctx', $contextId)->setMaxResults(10)->getResult();

        // --- Collection Rules ---
        $ruleTotal = (int) $em->createQuery('SELECT COUNT(r) FROM App\Entity\CollectionRule r WHERE r.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        $ruleEnabled = (int) $em->createQuery('SELECT COUNT(r) FROM App\Entity\CollectionRule r WHERE r.context = :ctx AND r.enabled = true')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        // --- Tags ---
        $tagCount = (int) $em->createQuery('SELECT COUNT(t) FROM App\Entity\NodeTag t WHERE t.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        // --- Profiles ---
        $profileCount = (int) $em->createQuery('SELECT COUNT(p) FROM App\Entity\Profile p WHERE p.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        // --- Models ---
        $modelCount = (int) $em->createQuery('SELECT COUNT(m) FROM App\Entity\DeviceModel m WHERE m.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        // --- Manufacturers ---
        $manufacturerCount = (int) $em->createQuery('SELECT COUNT(e) FROM App\Entity\Editor e WHERE e.context = :ctx')
            ->setParameter('ctx', $contextId)->getSingleScalarResult();

        // --- Compliance ---
        $compliance = $this->buildComplianceSection($contextId, $nodeTotal, $em);

        return $this->json([
            'nodes' => [
                'total' => $nodeTotal,
                'reachable' => $nodeReachable,
                'unreachable' => $nodeUnreachable,
                'unknown' => $nodeUnknown,
                'byManufacturer' => $nodesByManufacturer,
            ],
            'collections' => [
                'total' => $collectionTotal,
                'pending' => $collectionStatusMap[Collection::STATUS_PENDING] ?? 0,
                'running' => $collectionStatusMap[Collection::STATUS_RUNNING] ?? 0,
                'completed' => $collectionStatusMap[Collection::STATUS_COMPLETED] ?? 0,
                'failed' => $collectionStatusMap[Collection::STATUS_FAILED] ?? 0,
                'recent' => array_map(fn($c) => [
                    'id' => $c['id'],
                    'nodeIp' => $c['nodeIp'],
                    'nodeName' => $c['nodeName'],
                    'status' => $c['status'],
                    'commandCount' => $c['commandCount'],
                    'completedCount' => $c['completedCount'],
                    'error' => $c['error'],
                    'createdAt' => $c['createdAt']->format('c'),
                    'startedAt' => $c['startedAt']?->format('c'),
                    'completedAt' => $c['completedAt']?->format('c'),
                ], $recentCollections),
            ],
            'rules' => [
                'total' => $ruleTotal,
                'enabled' => $ruleEnabled,
            ],
            'inventory' => [
                'tags' => $tagCount,
                'profiles' => $profileCount,
                'models' => $modelCount,
                'manufacturers' => $manufacturerCount,
            ],
            'monitoring' => $context->isMonitoringEnabled(),
            'compliance' => $compliance,
            'vulnerabilities' => $this->buildVulnerabilitySection($contextId, $context, $em),
            'systemUpdates' => $this->buildSystemUpdateSection($contextId, $context, $em),
            'topology' => [
                'maps' => (int) $em->createQuery('SELECT COUNT(m) FROM App\Entity\TopologyMap m WHERE m.context = :ctx')->setParameter('ctx', $contextId)->getSingleScalarResult(),
                'devices' => (int) $em->createQuery('SELECT COUNT(d) FROM App\Entity\TopologyDevice d WHERE d.map IN (SELECT m.id FROM App\Entity\TopologyMap m WHERE m.context = :ctx)')->setParameter('ctx', $contextId)->getSingleScalarResult(),
                'links' => (int) $em->createQuery('SELECT COUNT(l) FROM App\Entity\TopologyLink l WHERE l.map IN (SELECT m.id FROM App\Entity\TopologyMap m WHERE m.context = :ctx)')->setParameter('ctx', $contextId)->getSingleScalarResult(),
            ],
            'reports' => [
                'total' => (int) $em->createQuery('SELECT COUNT(r) FROM App\Entity\Report r WHERE r.context = :ctx')->setParameter('ctx', $contextId)->getSingleScalarResult(),
                'generated' => (int) $em->createQuery('SELECT COUNT(r) FROM App\Entity\Report r WHERE r.context = :ctx AND r.generatedAt IS NOT NULL')->setParameter('ctx', $contextId)->getSingleScalarResult(),
            ],
            'automations' => [
                'schedulers' => 0,
                'active' => 0,
            ],
        ]);
    }

    /**
     * @return array<string,mixed>
     */
    private function buildComplianceSection(int $contextId, int $totalNodes, EntityManagerInterface $em): array
    {
        // Distinct nodes that have at least one compliance result
        $evaluatedNodes = (int) $em->createQuery(
            'SELECT COUNT(DISTINCT IDENTITY(cr.node)) FROM App\Entity\ComplianceResult cr
             JOIN cr.node n WHERE n.context = :ctx'
        )->setParameter('ctx', $contextId)->getSingleScalarResult();

        // Counts by status
        $statusRows = $em->createQuery(
            'SELECT cr.status AS status, COUNT(cr.id) AS total FROM App\Entity\ComplianceResult cr
             JOIN cr.node n WHERE n.context = :ctx GROUP BY cr.status'
        )->setParameter('ctx', $contextId)->getArrayResult();

        $byStatus = [
            'compliant' => 0,
            'non_compliant' => 0,
            'error' => 0,
            'not_applicable' => 0,
            'skipped' => 0,
        ];
        foreach ($statusRows as $row) {
            if (isset($byStatus[$row['status']])) {
                $byStatus[$row['status']] = (int) $row['total'];
            }
        }

        // Counts by severity (non_compliant only)
        $sevRows = $em->createQuery(
            'SELECT cr.severity AS severity, COUNT(cr.id) AS total FROM App\Entity\ComplianceResult cr
             JOIN cr.node n WHERE n.context = :ctx AND cr.status = :nc
             GROUP BY cr.severity'
        )->setParameters(['ctx' => $contextId, 'nc' => 'non_compliant'])->getArrayResult();

        $bySeverity = ['critical' => 0, 'high' => 0, 'medium' => 0, 'low' => 0, 'info' => 0];
        foreach ($sevRows as $row) {
            if ($row['severity'] && isset($bySeverity[$row['severity']])) {
                $bySeverity[$row['severity']] = (int) $row['total'];
            }
        }

        // Global score from severity-weighted penalty
        $totalApplicable = $byStatus['compliant'] + $byStatus['non_compliant'];
        $penaltySum = 0;
        foreach ($bySeverity as $sev => $cnt) {
            $penaltySum += $cnt * (ComplianceEvaluator::SEVERITY_WEIGHTS[$sev] ?? 0);
        }
        $globalScore = null;
        $globalGrade = null;
        if ($totalApplicable > 0) {
            $maxWeight = $totalApplicable * 10;
            $globalScore = (int) round(max(0, ($maxWeight - $penaltySum) / $maxWeight * 100));
            $globalGrade = ComplianceEvaluator::calculateGrade($totalApplicable, $penaltySum);
        }

        // Node distribution by cached grade
        $gradeRows = $em->createQuery(
            'SELECT n.score AS grade, COUNT(n.id) AS total FROM App\Entity\Node n
             WHERE n.context = :ctx GROUP BY n.score'
        )->setParameter('ctx', $contextId)->getArrayResult();

        $byGrade = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0, 'E' => 0, 'F' => 0, 'unrated' => 0];
        foreach ($gradeRows as $row) {
            $g = $row['grade'];
            if ($g === null || !isset($byGrade[$g])) {
                $byGrade['unrated'] += (int) $row['total'];
            } else {
                $byGrade[$g] = (int) $row['total'];
            }
        }

        // Top 5 unhealthy nodes (most non_compliant results)
        $topUnhealthyRows = $em->createQuery(
            'SELECT n.id, n.name, n.ipAddress, n.score AS grade,
                    COUNT(cr.id) AS violations,
                    SUM(CASE WHEN cr.severity = :crit THEN 1 ELSE 0 END) AS criticalCount
             FROM App\Entity\ComplianceResult cr
             JOIN cr.node n
             WHERE n.context = :ctx AND cr.status = :nc
             GROUP BY n.id, n.name, n.ipAddress, n.score
             ORDER BY violations DESC'
        )->setParameters(['ctx' => $contextId, 'nc' => 'non_compliant', 'crit' => 'critical'])
         ->setMaxResults(5)->getArrayResult();

        $topUnhealthyNodes = array_map(fn($r) => [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'ipAddress' => $r['ipAddress'],
            'grade' => $r['grade'],
            'violations' => (int) $r['violations'],
            'criticalCount' => (int) $r['criticalCount'],
        ], $topUnhealthyRows);

        // Top 5 violated rules
        $topRulesRows = $em->createQuery(
            'SELECT r.id, r.identifier, r.name,
                    COUNT(cr.id) AS violationCount,
                    SUM(CASE WHEN cr.severity = :crit THEN 1 ELSE 0 END) AS criticalCount,
                    SUM(CASE WHEN cr.severity = :high THEN 1 ELSE 0 END) AS highCount
             FROM App\Entity\ComplianceResult cr
             JOIN cr.rule r
             JOIN cr.node n
             WHERE n.context = :ctx AND cr.status = :nc
             GROUP BY r.id, r.identifier, r.name
             ORDER BY violationCount DESC'
        )->setParameters(['ctx' => $contextId, 'nc' => 'non_compliant', 'crit' => 'critical', 'high' => 'high'])
         ->setMaxResults(5)->getArrayResult();

        $topViolatedRules = array_map(fn($r) => [
            'id' => (int) $r['id'],
            'identifier' => $r['identifier'],
            'name' => $r['name'],
            'violationCount' => (int) $r['violationCount'],
            'criticalCount' => (int) $r['criticalCount'],
            'highCount' => (int) $r['highCount'],
        ], $topRulesRows);

        // Last evaluated timestamp
        $lastEvaluatedRaw = $em->createQuery(
            'SELECT MAX(cr.evaluatedAt) FROM App\Entity\ComplianceResult cr
             JOIN cr.node n WHERE n.context = :ctx'
        )->setParameter('ctx', $contextId)->getSingleScalarResult();

        $lastEvaluatedAt = null;
        if ($lastEvaluatedRaw) {
            try {
                $lastEvaluatedAt = (new \DateTimeImmutable($lastEvaluatedRaw))->format(\DateTimeInterface::ATOM);
            } catch (\Exception $e) {
                $lastEvaluatedAt = null;
            }
        }

        // Active enabled policies count
        $policyCount = (int) $em->createQuery(
            'SELECT COUNT(p) FROM App\Entity\CompliancePolicy p WHERE p.context = :ctx AND p.enabled = true'
        )->setParameter('ctx', $contextId)->getSingleScalarResult();

        return [
            'globalScore' => $globalScore,
            'globalGrade' => $globalGrade,
            'evaluatedNodes' => $evaluatedNodes,
            'totalNodes' => $totalNodes,
            'enabledPolicies' => $policyCount,
            'byStatus' => $byStatus,
            'bySeverity' => $bySeverity,
            'byGrade' => $byGrade,
            'topUnhealthyNodes' => $topUnhealthyNodes,
            'topViolatedRules' => $topViolatedRules,
            'lastEvaluatedAt' => $lastEvaluatedAt,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function buildSystemUpdateSection(int $contextId, Context $context, EntityManagerInterface $em): array
    {
        if (!$context->isSystemUpdateEnabled()) {
            return ['enabled' => false];
        }

        $conn = $em->getConnection();

        // Total product ranges
        $totalRanges = (int) $conn->fetchOne(
            'SELECT COUNT(*) FROM product_range WHERE context_id = ?',
            [$contextId]
        );

        // Nodes with a productModel field set
        $nodesWithRange = (int) $conn->fetchOne(
            'SELECT COUNT(*) FROM node WHERE context_id = ? AND product_model IS NOT NULL',
            [$contextId]
        );

        // Distribution by system update grade
        $gradeRows = $conn->fetchAllAssociative(
            'SELECT system_update_score AS grade, COUNT(*) AS cnt FROM node
             WHERE context_id = ? AND system_update_score IS NOT NULL
             GROUP BY system_update_score',
            [$contextId]
        );
        $byGrade = ['A' => 0, 'B' => 0, 'C' => 0, 'D' => 0, 'E' => 0, 'F' => 0];
        foreach ($gradeRows as $row) {
            if (isset($byGrade[$row['grade']])) {
                $byGrade[$row['grade']] = (int) $row['cnt'];
            }
        }

        // Nodes past end-of-life (match node.product_model against product_range names)
        $pastEol = (int) $conn->fetchOne(
            'SELECT COUNT(*) FROM node n
             WHERE n.context_id = ? AND n.product_model IS NOT NULL
             AND EXISTS (
                 SELECT 1 FROM product_range pr
                 WHERE pr.context_id = n.context_id
                 AND pr.end_of_life_date IS NOT NULL AND pr.end_of_life_date < NOW()
                 AND n.product_model ILIKE CONCAT(\'%\', SPLIT_PART(pr.name, \' (\', 1), \'%\')
             )',
            [$contextId]
        );

        // Nodes past end-of-support
        $pastEos = (int) $conn->fetchOne(
            'SELECT COUNT(*) FROM node n
             WHERE n.context_id = ? AND n.product_model IS NOT NULL
             AND EXISTS (
                 SELECT 1 FROM product_range pr
                 WHERE pr.context_id = n.context_id
                 AND pr.end_of_support_date IS NOT NULL AND pr.end_of_support_date < NOW()
                 AND n.product_model ILIKE CONCAT(\'%\', SPLIT_PART(pr.name, \' (\', 1), \'%\')
             )',
            [$contextId]
        );

        return [
            'enabled' => true,
            'totalRanges' => $totalRanges,
            'nodesWithRange' => $nodesWithRange,
            'byGrade' => $byGrade,
            'pastEndOfLife' => $pastEol,
            'pastEndOfSupport' => $pastEos,
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function buildVulnerabilitySection(int $contextId, Context $context, EntityManagerInterface $em): array
    {
        if (!$context->isVulnerabilityEnabled()) {
            return ['enabled' => false];
        }

        $conn = $em->getConnection();

        $total = (int) $conn->fetchOne('SELECT COUNT(*) FROM cve WHERE context_id = ?', [$contextId]);

        $sevRows = $conn->fetchAllAssociative(
            'SELECT severity, COUNT(*) as cnt FROM cve WHERE context_id = ? GROUP BY severity',
            [$contextId]
        );
        $bySeverity = [];
        foreach ($sevRows as $row) {
            $bySeverity[$row['severity']] = (int) $row['cnt'];
        }

        $topModels = $conn->fetchAllAssociative(
            'SELECT dm.name, e.name as manufacturer, COUNT(cdm.id) as cve_count
             FROM cve_device_model cdm
             JOIN device_model dm ON dm.id = cdm.device_model_id
             JOIN editor e ON e.id = dm.manufacturer_id
             JOIN cve c ON c.id = cdm.cve_id
             WHERE c.context_id = ?
             GROUP BY dm.name, e.name
             ORDER BY cve_count DESC LIMIT 5',
            [$contextId]
        );

        return [
            'enabled' => true,
            'total' => $total,
            'bySeverity' => $bySeverity,
            'topAffectedModels' => $topModels,
            'lastSyncAt' => $context->getLastVulnerabilitySyncAt()?->format('c'),
            'lastSyncStatus' => $context->getLastVulnerabilitySyncStatus(),
        ];
    }
}

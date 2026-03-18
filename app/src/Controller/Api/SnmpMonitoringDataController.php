<?php

namespace App\Controller\Api;

use App\Entity\MonitoringOid;
use App\Entity\Node;
use App\Entity\SnmpMonitoringData;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/snmp-monitoring')]
class SnmpMonitoringDataController extends AbstractController
{
    #[Route('/by-node/{id}', methods: ['GET'])]
    public function byNode(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $node->getContext();
        $retentionMinutes = $context ? $context->getSnmpRetentionMinutes() : 120;
        $since = new \DateTimeImmutable("-{$retentionMinutes} minutes");

        $qb = $em->createQueryBuilder()
            ->select('d.category', 'd.rawValue', 'd.numericValue', 'd.recordedAt')
            ->from(SnmpMonitoringData::class, 'd')
            ->where('d.node = :node')
            ->andWhere('d.recordedAt >= :since')
            ->setParameter('node', $node)
            ->setParameter('since', $since)
            ->orderBy('d.recordedAt', 'ASC');

        $category = $request->query->get('category');
        if ($category) {
            $qb->andWhere('d.category = :category')
               ->setParameter('category', $category);
        }

        $rows = $qb->getQuery()->getArrayResult();

        // Group by category
        $grouped = [];
        foreach ($rows as $row) {
            $cat = $row['category'];
            if (!isset($grouped[$cat])) {
                $grouped[$cat] = [];
            }
            $grouped[$cat][] = [
                'value' => $row['numericValue'],
                'raw' => $row['rawValue'],
                'time' => $row['recordedAt']->format('c'),
            ];
        }

        // SNMP OID configs from the node's model
        $model = $node->getModel();
        $oidConfig = [];
        if ($model) {
            $oids = $em->getRepository(MonitoringOid::class)->findBy([
                'deviceModel' => $model,
                'enabled' => true,
            ]);
            foreach ($oids as $o) {
                $oidConfig[] = [
                    'category' => $o->getCategory(),
                    'oid' => $o->getOid(),
                ];
            }
        }

        // Always include ping configs if monitoring is enabled
        $monitoringEnabled = $context?->isMonitoringEnabled() ?? false;
        if ($monitoringEnabled) {
            $oidConfig[] = ['category' => 'ping_latency', 'oid' => 'icmp'];
            $oidConfig[] = ['category' => 'ping_status', 'oid' => 'icmp'];
        }

        return $this->json([
            'retentionMinutes' => $retentionMinutes,
            'categories' => $grouped,
            'oidConfig' => $oidConfig,
        ]);
    }
}

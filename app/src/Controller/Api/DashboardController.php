<?php

namespace App\Controller\Api;

use App\Entity\Collection;
use App\Entity\Context;
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
        ]);
    }
}

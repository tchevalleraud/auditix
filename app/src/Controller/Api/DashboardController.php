<?php

namespace App\Controller\Api;

use App\Entity\Context;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/contexts/{id}/dashboard')]
class DashboardController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Context $context): JsonResponse
    {
        // TODO: Replace with real data from database when entities exist
        return $this->json([
            'context' => [
                'id' => $context->getId(),
                'name' => $context->getName(),
                'monitoringEnabled' => $context->isMonitoringEnabled(),
            ],
            'stats' => [
                'equipments' => 0,
                'audits' => 0,
                'collections' => 0,
                'reports' => 0,
            ],
            'recentAudits' => [],
        ]);
    }
}

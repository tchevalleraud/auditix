<?php

namespace App\Controller\Api\Admin;

use App\Entity\AuditLog;
use App\Repository\AuditLogRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/audit')]
#[IsGranted('ROLE_ADMIN')]
class AuditLogController extends AbstractController
{
    public function __construct(
        private readonly AuditLogRepository $repository,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $limit = max(1, min(200, (int) $request->query->get('limit', 50)));

        $category = $request->query->get('category');
        $level = $request->query->get('level');
        $search = trim((string) $request->query->get('search', ''));
        $sinceParam = $request->query->get('since');

        $since = null;
        if (is_string($sinceParam) && $sinceParam !== '') {
            try {
                $since = new \DateTimeImmutable($sinceParam);
            } catch (\Exception) {
                $since = null;
            }
        }

        $filters = [
            'category' => is_string($category) && in_array($category, AuditLog::CATEGORIES, true) ? $category : null,
            'level' => is_string($level) && in_array($level, AuditLog::LEVELS, true) ? $level : null,
            'search' => $search === '' ? null : $search,
            'since' => $since,
        ];

        $result = $this->repository->search($filters, $page, $limit);

        return $this->json([
            'items' => array_map($this->serialize(...), $result['items']),
            'total' => $result['total'],
            'page' => $page,
            'limit' => $limit,
            'pages' => $result['total'] > 0 ? (int) ceil($result['total'] / $limit) : 0,
        ]);
    }

    #[Route('/categories', methods: ['GET'])]
    public function categories(): JsonResponse
    {
        return $this->json([
            'categories' => AuditLog::CATEGORIES,
            'levels' => AuditLog::LEVELS,
        ]);
    }

    private function serialize(AuditLog $log): array
    {
        return [
            'id' => $log->getId(),
            'loggedAt' => $log->getLoggedAt()->format(\DateTimeInterface::ATOM),
            'level' => $log->getLevel(),
            'category' => $log->getCategory(),
            'action' => $log->getAction(),
            'actor' => $log->getActor(),
            'sourceIp' => $log->getSourceIp(),
            'message' => $log->getMessage(),
            'context' => $log->getContext(),
        ];
    }
}

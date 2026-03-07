<?php

namespace App\Controller\Api\Admin;

use App\Entity\Collection;
use App\Entity\Task;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/tasks')]
class TaskController extends AbstractController
{
    private function serializeTask(Task $t): array
    {
        $node = $t->getNode();
        $context = $t->getContext();

        return [
            'id' => $t->getId(),
            'type' => $t->getType(),
            'status' => $t->getStatus(),
            'worker' => $t->getWorker(),
            'output' => $t->getOutput(),
            'node' => $node ? [
                'id' => $node->getId(),
                'ipAddress' => $node->getIpAddress(),
                'name' => $node->getName(),
            ] : null,
            'context' => $context ? [
                'id' => $context->getId(),
                'name' => $context->getName(),
            ] : null,
            'startedAt' => $t->getStartedAt()?->format('c'),
            'completedAt' => $t->getCompletedAt()?->format('c'),
            'createdAt' => $t->getCreatedAt()->format('c'),
        ];
    }

    private function serializeCollection(Collection $c): array
    {
        $node = $c->getNode();
        $context = $c->getContext();

        return [
            'id' => 'col-' . $c->getId(),
            'type' => 'collection',
            'status' => $c->getStatus(),
            'worker' => $c->getWorker(),
            'output' => $c->getError()
                ? $c->getError()
                : ($c->getCompletedCount() . '/' . $c->getCommandCount() . ' commands' . (!empty($c->getTags()) ? ' [' . implode(', ', $c->getTags()) . ']' : '')),
            'node' => [
                'id' => $node->getId(),
                'ipAddress' => $node->getIpAddress(),
                'name' => $node->getName(),
            ],
            'context' => $context ? [
                'id' => $context->getId(),
                'name' => $context->getName(),
            ] : null,
            'startedAt' => $c->getStartedAt()?->format('c'),
            'completedAt' => $c->getCompletedAt()?->format('c'),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $status = $request->query->get('status');
        $type = $request->query->get('type');
        $page = max(1, $request->query->getInt('page', 1));
        $limit = min(100, max(1, $request->query->getInt('limit', 50)));
        $offset = ($page - 1) * $limit;

        $items = [];

        // Fetch tasks (unless filtering by type=collection)
        if (!$type || $type !== 'collection') {
            $qb = $em->getRepository(Task::class)->createQueryBuilder('t')
                ->orderBy('t.createdAt', 'DESC');
            if ($status) {
                $qb->andWhere('t.status = :status')->setParameter('status', $status);
            }
            if ($type) {
                $qb->andWhere('t.type = :type')->setParameter('type', $type);
            }
            foreach ($qb->getQuery()->getResult() as $t) {
                $items[] = $this->serializeTask($t);
            }
        }

        // Fetch collections (unless filtering by a non-collection type)
        if (!$type || $type === 'collection') {
            $qb = $em->getRepository(Collection::class)->createQueryBuilder('c')
                ->orderBy('c.createdAt', 'DESC');
            if ($status) {
                $qb->andWhere('c.status = :status')->setParameter('status', $status);
            }
            foreach ($qb->getQuery()->getResult() as $c) {
                $items[] = $this->serializeCollection($c);
            }
        }

        // Sort merged results by createdAt DESC
        usort($items, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));

        $total = count($items);
        $paged = array_slice($items, $offset, $limit);

        return $this->json([
            'items' => $paged,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => max(1, (int) ceil($total / $limit)),
        ]);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Task $task): JsonResponse
    {
        return $this->json($this->serializeTask($task));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Task $task, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($task);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

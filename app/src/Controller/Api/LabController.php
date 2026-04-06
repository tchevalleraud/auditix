<?php

namespace App\Controller\Api;

use App\Entity\CompliancePolicy;
use App\Entity\Context;
use App\Entity\Lab;
use App\Entity\LabTask;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/labs')]
class LabController extends AbstractController
{
    private function serializeTask(LabTask $task): array
    {
        return [
            'id' => $task->getId(),
            'name' => $task->getName(),
            'description' => $task->getDescription(),
            'position' => $task->getPosition(),
            'policies' => $task->getPolicies()->map(fn(CompliancePolicy $p) => [
                'id' => $p->getId(),
                'name' => $p->getName(),
            ])->toArray(),
            'createdAt' => $task->getCreatedAt()->format('c'),
        ];
    }

    private function serialize(Lab $lab): array
    {
        return [
            'id' => $lab->getId(),
            'name' => $lab->getName(),
            'description' => $lab->getDescription(),
            'tasks' => array_values($lab->getTasks()->map($this->serializeTask(...))->toArray()),
            'createdAt' => $lab->getCreatedAt()->format('c'),
        ];
    }

    // ---- Lab CRUD ----

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->get('context');
        if (!$contextId) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $labs = $em->getRepository(Lab::class)->findBy(['context' => $context], ['name' => 'ASC']);

        return $this->json(array_map($this->serialize(...), $labs));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->get('context');

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $lab = new Lab();
        $lab->setName($data['name']);
        $lab->setDescription($data['description'] ?? null);
        $lab->setContext($context);

        $em->persist($lab);
        $em->flush();

        return $this->json($this->serialize($lab), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Lab $lab): JsonResponse
    {
        return $this->json($this->serialize($lab));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Lab $lab, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $lab->setName($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $lab->setDescription($data['description']);
        }

        $em->flush();

        return $this->json($this->serialize($lab));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Lab $lab, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($lab);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    // ---- Task CRUD ----

    #[Route('/{id}/tasks', methods: ['POST'])]
    public function createTask(Lab $lab, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (empty($data['name'])) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $task = new LabTask();
        $task->setName($data['name']);
        $task->setDescription($data['description'] ?? null);
        $task->setPosition($data['position'] ?? 0);
        $task->setLab($lab);

        if (!empty($data['policyIds'])) {
            foreach ($data['policyIds'] as $policyId) {
                $policy = $em->getRepository(CompliancePolicy::class)->find($policyId);
                if ($policy) $task->addPolicy($policy);
            }
        }

        $em->persist($task);
        $em->flush();

        return $this->json($this->serializeTask($task), Response::HTTP_CREATED);
    }

    #[Route('/{id}/tasks/{taskId}', methods: ['PUT'])]
    public function updateTask(Lab $lab, int $taskId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $task = $em->getRepository(LabTask::class)->find($taskId);
        if (!$task || $task->getLab()->getId() !== $lab->getId()) {
            return $this->json(['error' => 'Task not found'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $task->setName($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $task->setDescription($data['description']);
        }
        if (isset($data['position'])) {
            $task->setPosition($data['position']);
        }
        if (array_key_exists('policyIds', $data)) {
            $task->clearPolicies();
            if (is_array($data['policyIds'])) {
                foreach ($data['policyIds'] as $policyId) {
                    $policy = $em->getRepository(CompliancePolicy::class)->find($policyId);
                    if ($policy) $task->addPolicy($policy);
                }
            }
        }

        $em->flush();

        return $this->json($this->serializeTask($task));
    }

    #[Route('/{id}/tasks/{taskId}', methods: ['DELETE'])]
    public function deleteTask(Lab $lab, int $taskId, EntityManagerInterface $em): JsonResponse
    {
        $task = $em->getRepository(LabTask::class)->find($taskId);
        if (!$task || $task->getLab()->getId() !== $lab->getId()) {
            return $this->json(['error' => 'Task not found'], Response::HTTP_NOT_FOUND);
        }

        $em->remove($task);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

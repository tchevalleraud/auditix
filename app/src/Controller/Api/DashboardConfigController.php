<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Dashboard;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class DashboardConfigController extends AbstractController
{
    private function serialize(Dashboard $d): array
    {
        return [
            'id' => $d->getId(),
            'name' => $d->getName(),
            'isDefault' => $d->isDefault(),
            'widgets' => $d->getWidgets(),
            'updatedAt' => $d->getUpdatedAt()->format('c'),
        ];
    }

    private function ensureDefault(Context $context, EntityManagerInterface $em): Dashboard
    {
        $existing = $em->getRepository(Dashboard::class)->findBy(['context' => $context]);
        if (count($existing) === 0) {
            $d = new Dashboard();
            $d->setContext($context);
            $d->setName('Default');
            $d->setIsDefault(true);
            $d->setWidgets([]);
            $em->persist($d);
            $em->flush();
            return $d;
        }
        $hasDefault = false;
        foreach ($existing as $d) {
            if ($d->isDefault()) { $hasDefault = true; break; }
        }
        if (!$hasDefault) {
            $existing[0]->setIsDefault(true);
            $em->flush();
        }
        return $existing[0];
    }

    private function clearDefaults(Context $context, EntityManagerInterface $em, ?int $exceptId = null): void
    {
        $qb = $em->createQueryBuilder();
        $qb->update(Dashboard::class, 'd')
            ->set('d.isDefault', ':false')
            ->where('d.context = :ctx')
            ->setParameter('false', false)
            ->setParameter('ctx', $context);
        if ($exceptId !== null) {
            $qb->andWhere('d.id != :id')->setParameter('id', $exceptId);
        }
        $qb->getQuery()->execute();
    }

    #[Route('/api/contexts/{contextId}/dashboards', methods: ['GET'], requirements: ['contextId' => '\\d+'])]
    public function list(int $contextId, EntityManagerInterface $em): JsonResponse
    {
        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $this->ensureDefault($context, $em);

        $dashboards = $em->getRepository(Dashboard::class)->findBy(
            ['context' => $context],
            ['isDefault' => 'DESC', 'name' => 'ASC'],
        );
        return $this->json(array_map($this->serialize(...), $dashboards));
    }

    #[Route('/api/contexts/{contextId}/dashboards', methods: ['POST'], requirements: ['contextId' => '\\d+'])]
    public function create(int $contextId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $d = new Dashboard();
        $d->setContext($context);
        $d->setName(mb_substr($name, 0, 100));
        $d->setWidgets(is_array($data['widgets'] ?? null) ? $data['widgets'] : []);
        $d->setIsDefault((bool)($data['isDefault'] ?? false));

        $em->persist($d);
        $em->flush();

        if ($d->isDefault()) {
            $this->clearDefaults($context, $em, $d->getId());
        }

        return $this->json($this->serialize($d), Response::HTTP_CREATED);
    }

    #[Route('/api/dashboards/{id}', methods: ['PUT'], requirements: ['id' => '\\d+'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $d = $em->getRepository(Dashboard::class)->find($id);
        if (!$d) {
            return $this->json(['error' => 'Dashboard not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $d->getContext());

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $d->setName(mb_substr($name, 0, 100));
        }
        if (array_key_exists('widgets', $data) && is_array($data['widgets'])) {
            $d->setWidgets($data['widgets']);
        }
        if (array_key_exists('isDefault', $data)) {
            $next = (bool)$data['isDefault'];
            if ($next) {
                $this->clearDefaults($d->getContext(), $em, $d->getId());
                $d->setIsDefault(true);
            } else {
                $d->setIsDefault(false);
                $em->flush();
                $this->ensureDefault($d->getContext(), $em);
                $em->refresh($d);
            }
        }

        $em->flush();
        return $this->json($this->serialize($d));
    }

    #[Route('/api/dashboards/{id}', methods: ['DELETE'], requirements: ['id' => '\\d+'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $d = $em->getRepository(Dashboard::class)->find($id);
        if (!$d) {
            return $this->json(['error' => 'Dashboard not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $d->getContext());

        $context = $d->getContext();
        $wasDefault = $d->isDefault();
        $em->remove($d);
        $em->flush();

        if ($wasDefault) {
            $this->ensureDefault($context, $em);
        }

        return $this->json(['success' => true]);
    }
}

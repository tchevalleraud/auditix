<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\ReportTheme;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/report-themes')]
class ReportThemeController extends AbstractController
{
    private function serialize(ReportTheme $t): array
    {
        return [
            'id' => $t->getId(),
            'name' => $t->getName(),
            'description' => $t->getDescription(),
            'isDefault' => $t->isDefault(),
            'styles' => $t->getStyles(),
            'contextId' => $t->getContext()?->getId(),
            'createdAt' => $t->getCreatedAt()->format('c'),
        ];
    }

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

        $qb = $em->createQueryBuilder();
        $qb->select('t')
            ->from(ReportTheme::class, 't')
            ->where('t.context = :context OR t.context IS NULL')
            ->setParameter('context', $context)
            ->orderBy('t.isDefault', 'DESC')
            ->addOrderBy('t.name', 'ASC');

        $themes = $qb->getQuery()->getResult();

        return $this->json(array_map($this->serialize(...), $themes));
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

        $theme = new ReportTheme();
        $theme->setName($data['name']);
        $theme->setContext($context);

        if (array_key_exists('description', $data)) {
            $theme->setDescription($data['description']);
        }

        $em->persist($theme);
        $em->flush();

        return $this->json($this->serialize($theme), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(ReportTheme $theme): JsonResponse
    {
        return $this->json($this->serialize($theme));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(ReportTheme $theme, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $theme->setName($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $theme->setDescription($data['description']);
        }
        if (isset($data['styles'])) {
            $theme->setStyles($data['styles']);
        }

        $em->flush();

        return $this->json($this->serialize($theme));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(ReportTheme $theme, EntityManagerInterface $em): JsonResponse
    {
        if ($theme->isDefault()) {
            return $this->json(['error' => 'Cannot delete the default theme'], Response::HTTP_BAD_REQUEST);
        }

        $em->remove($theme);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

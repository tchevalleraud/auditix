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

class ReportThemeExportController extends AbstractController
{
    // ─── EXPORT ───────────────────────────────────────────────────────

    #[Route('/api/report-themes/{id}/export', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function export(ReportTheme $theme): Response
    {
        $data = [
            '_format' => 'auditix-report-theme-export',
            '_version' => 1,
            '_exportedAt' => (new \DateTimeImmutable())->format('c'),
            'theme' => [
                'name' => $theme->getName(),
                'description' => $theme->getDescription(),
                'styles' => $theme->getStyles(),
            ],
        ];

        $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $theme->getName());
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return new Response($json, Response::HTTP_OK, [
            'Content-Type' => 'application/json',
            'Content-Disposition' => sprintf('attachment; filename="theme-%s.json"', $safeName),
        ]);
    }

    // ─── PREVIEW IMPORT ───────────────────────────────────────────────

    #[Route('/api/report-themes/preview-import', methods: ['POST'], priority: 10)]
    public function previewImport(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-report-theme-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $themeName = $data['theme']['name'] ?? '';

        $existing = $em->createQueryBuilder()
            ->select('t')
            ->from(ReportTheme::class, 't')
            ->where('t.name = :name')
            ->andWhere('t.context = :context OR t.context IS NULL')
            ->setParameter('name', $themeName)
            ->setParameter('context', $context)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();

        return $this->json([
            'theme' => [
                'name' => $themeName,
                'description' => $data['theme']['description'] ?? null,
                'exists' => $existing !== null,
                'colors' => [
                    'primary' => $data['theme']['styles']['colors']['primary'] ?? '#1e293b',
                    'secondary' => $data['theme']['styles']['colors']['secondary'] ?? '#3b82f6',
                ],
                'font' => $data['theme']['styles']['body']['font'] ?? 'Calibri',
                'fontSize' => $data['theme']['styles']['body']['size'] ?? 11,
            ],
            'exportedAt' => $data['_exportedAt'] ?? null,
        ]);
    }

    // ─── IMPORT ───────────────────────────────────────────────────────

    #[Route('/api/report-themes/import', methods: ['POST'], priority: 10)]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-report-theme-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $theme = new ReportTheme();
        $theme->setName($data['theme']['name'] ?? 'Imported Theme');
        $theme->setDescription($data['theme']['description'] ?? null);
        $theme->setContext($context);

        if (!empty($data['theme']['styles'])) {
            $theme->setStyles($data['theme']['styles']);
        }

        $em->persist($theme);
        $em->flush();

        return $this->json([
            'id' => $theme->getId(),
            'name' => $theme->getName(),
            'description' => $theme->getDescription(),
            'isDefault' => $theme->isDefault(),
            'styles' => $theme->getStyles(),
            'contextId' => $theme->getContext()?->getId(),
            'createdAt' => $theme->getCreatedAt()->format('c'),
        ], Response::HTTP_CREATED);
    }
}

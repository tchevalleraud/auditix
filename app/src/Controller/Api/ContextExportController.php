<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Service\Context\ContextExporter;
use App\Service\Context\ContextImporter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

class ContextExportController extends AbstractController
{
    public function __construct(
        private readonly ContextExporter $exporter,
        private readonly ContextImporter $importer,
        private readonly EntityManagerInterface $em,
    ) {}

    #[Route('/api/contexts/export-all', methods: ['GET'], priority: 10)]
    #[IsGranted('ROLE_ADMIN')]
    public function exportAll(): BinaryFileResponse
    {
        @set_time_limit(0);
        @ini_set('memory_limit', '-1');

        $contexts = $this->em->getRepository(Context::class)->findBy([], ['name' => 'ASC']);
        $path = $this->exporter->export($contexts);

        return $this->streamZip($path, sprintf(
            'auditix-contexts-%s.zip',
            (new \DateTimeImmutable())->format('Ymd-His'),
        ));
    }

    #[Route('/api/contexts/{id}/export', methods: ['GET'], requirements: ['id' => '\d+'], priority: 10)]
    #[IsGranted('ROLE_ADMIN')]
    public function exportOne(Context $context): BinaryFileResponse
    {
        @set_time_limit(0);
        @ini_set('memory_limit', '-1');

        $path = $this->exporter->export([$context]);
        $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $context->getName() ?? 'context');

        return $this->streamZip($path, sprintf(
            'auditix-context-%s-%s.zip',
            $safeName,
            (new \DateTimeImmutable())->format('Ymd-His'),
        ));
    }

    #[Route('/api/contexts/import/preview', methods: ['POST'], priority: 10)]
    #[IsGranted('ROLE_ADMIN')]
    public function importPreview(Request $request): JsonResponse
    {
        @set_time_limit(0);
        @ini_set('memory_limit', '-1');

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }
        try {
            $preview = $this->importer->preview($file->getPathname());
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }
        return $this->json($preview);
    }

    #[Route('/api/contexts/import', methods: ['POST'], priority: 10)]
    #[IsGranted('ROLE_ADMIN')]
    public function import(Request $request): JsonResponse
    {
        @set_time_limit(0);
        @ini_set('memory_limit', '-1');

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }
        try {
            $contexts = $this->importer->import($file->getPathname());
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        return $this->json([
            'imported' => array_map(fn(Context $c) => [
                'id' => $c->getId(),
                'name' => $c->getName(),
                'isDefault' => $c->isDefault(),
            ], $contexts),
        ], Response::HTTP_CREATED);
    }

    private function streamZip(string $path, string $filename): BinaryFileResponse
    {
        $response = new BinaryFileResponse($path);
        $response->headers->set('Content-Type', 'application/zip');
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $filename);
        $response->deleteFileAfterSend(true);
        return $response;
    }
}

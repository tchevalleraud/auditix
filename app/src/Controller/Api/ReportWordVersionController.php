<?php

namespace App\Controller\Api;

use App\Entity\Report;
use App\Entity\ReportWordVersion;
use App\Message\GenerateReportWordMessage;
use App\Repository\ReportWordVersionRepository;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/reports/{id}/word-versions')]
class ReportWordVersionController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ReportWordVersionRepository $versions,
    ) {}

    private function serialize(ReportWordVersion $v): array
    {
        return [
            'id' => $v->getId(),
            'versionNumber' => $v->getVersionNumber(),
            'nodeId' => $v->getNode()?->getId(),
            'nodeLabel' => $v->getNodeLabel(),
            'status' => $v->getStatus(),
            'error' => $v->getError(),
            'isCurrent' => $v->isCurrent(),
            'fileSize' => $v->getFileSize(),
            'createdBy' => $v->getCreatedBy(),
            'createdAt' => $v->getCreatedAt()->format('c'),
        ];
    }

    private function assertBelongs(Report $report, ReportWordVersion $version): void
    {
        if ($version->getReport()->getId() !== $report->getId()) {
            throw $this->createNotFoundException('Version not found for this report');
        }
    }

    #[Route('', methods: ['GET'])]
    public function index(Report $report): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);

        return $this->json(array_map($this->serialize(...), $this->versions->findForReport($report)));
    }

    #[Route('/generate', methods: ['POST'])]
    public function generate(Report $report, MessageBusInterface $bus): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);

        // Block double submissions while a generation is still in flight.
        $inFlight = $this->versions->createQueryBuilder('v')
            ->select('COUNT(v.id)')
            ->andWhere('v.report = :report')
            ->andWhere('v.status IN (:busy)')
            ->setParameter('report', $report)
            ->setParameter('busy', [ReportWordVersion::STATUS_PENDING, ReportWordVersion::STATUS_RUNNING])
            ->getQuery()
            ->getSingleScalarResult();

        if ((int) $inFlight > 0) {
            return $this->json(['error' => 'Word generation already in progress'], Response::HTTP_CONFLICT);
        }

        $bus->dispatch(new GenerateReportWordMessage(
            $report->getId(),
            $this->getUser()?->getUserIdentifier(),
        ));

        return $this->json(['status' => 'queued']);
    }

    #[Route('/{versionId}/download', methods: ['GET'])]
    public function download(Report $report, int $versionId): Response
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);
        $version = $this->versions->find($versionId);
        if (!$version) {
            return $this->json(['error' => 'Version not found'], Response::HTTP_NOT_FOUND);
        }
        $this->assertBelongs($report, $version);

        if (!$version->getFilePath()) {
            return $this->json(['error' => 'No generated file for this version'], Response::HTTP_NOT_FOUND);
        }

        $path = '/var/www/var/' . $version->getFilePath();
        if (!file_exists($path)) {
            return $this->json(['error' => 'File not found'], Response::HTTP_NOT_FOUND);
        }

        $filename = $this->buildFilename($report, $version);
        $response = new BinaryFileResponse($path);
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $filename);
        $response->headers->set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        return $response;
    }

    #[Route('/{versionId}/restore', methods: ['POST'])]
    public function restore(Report $report, int $versionId): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);
        $version = $this->versions->find($versionId);
        if (!$version) {
            return $this->json(['error' => 'Version not found'], Response::HTTP_NOT_FOUND);
        }
        $this->assertBelongs($report, $version);

        if ($version->getStatus() !== null || !$version->getFilePath()) {
            return $this->json(['error' => 'Only a ready version can be set as current'], Response::HTTP_BAD_REQUEST);
        }

        $this->versions->clearCurrent($report, $version->getNode());
        $version->setIsCurrent(true);
        $this->em->flush();

        return $this->json($this->serialize($version));
    }

    #[Route('/{versionId}', methods: ['DELETE'])]
    public function delete(Report $report, int $versionId): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);
        $version = $this->versions->find($versionId);
        if (!$version) {
            return $this->json(['error' => 'Version not found'], Response::HTTP_NOT_FOUND);
        }
        $this->assertBelongs($report, $version);

        $this->removeVersion($version);
        $this->em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/bulk-delete', methods: ['POST'])]
    public function bulkDelete(Report $report, Request $request): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $report);
        $data = json_decode($request->getContent(), true);
        $ids = $data['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) {
            return $this->json(['error' => 'ids is required'], Response::HTTP_BAD_REQUEST);
        }

        $deleted = 0;
        foreach ($ids as $id) {
            $version = $this->versions->find((int) $id);
            if ($version && $version->getReport()->getId() === $report->getId()) {
                $this->removeVersion($version);
                $deleted++;
            }
        }
        $this->em->flush();

        return $this->json(['deleted' => $deleted]);
    }

    /**
     * Remove a version: delete its file, drop the row, and auto-promote the most
     * recent remaining ready version of the same scope to current if needed.
     */
    private function removeVersion(ReportWordVersion $version): void
    {
        $report = $version->getReport();
        $node = $version->getNode();
        $wasCurrent = $version->isCurrent();

        if ($version->getFilePath()) {
            $path = '/var/www/var/' . $version->getFilePath();
            if (is_file($path)) {
                @unlink($path);
            }
        }

        $this->em->remove($version);
        $this->em->flush();

        if ($wasCurrent) {
            $latest = $this->versions->findLatestReady($report, $node);
            if ($latest) {
                $latest->setIsCurrent(true);
            }
        }
    }

    private function buildFilename(Report $report, ReportWordVersion $version): string
    {
        $base = preg_replace('/[^A-Za-z0-9_-]+/', '_', $report->getName() ?: 'report');
        $base = trim((string) $base, '_') ?: 'report';
        $suffix = $version->getNodeLabel() ? '_' . preg_replace('/[^A-Za-z0-9_-]+/', '_', $version->getNodeLabel()) : '';

        return sprintf('%s%s_v%d.docx', $base, $suffix, $version->getVersionNumber());
    }
}

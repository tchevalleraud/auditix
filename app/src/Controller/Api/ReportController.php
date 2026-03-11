<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Report;
use App\Entity\ReportTheme;
use App\Message\GenerateReportMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/reports')]
class ReportController extends AbstractController
{
    private function serialize(Report $r): array
    {
        $theme = $r->getTheme();
        return [
            'id' => $r->getId(),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'type' => $r->getType(),
            'title' => $r->getTitle(),
            'subtitle' => $r->getSubtitle(),
            'showTableOfContents' => $r->getShowTableOfContents(),
            'showAuthorsPage' => $r->getShowAuthorsPage(),
            'showRevisionPage' => $r->getShowRevisionPage(),
            'showIllustrationsPage' => $r->getShowIllustrationsPage(),
            'tags' => $r->getTags(),
            'blocks' => $r->getBlocks(),
            'theme' => $theme ? ['id' => $theme->getId(), 'name' => $theme->getName()] : null,
            'generatingStatus' => $r->getGeneratingStatus(),
            'generatedAt' => $r->getGeneratedAt()?->format('c'),
            'generatedFile' => $r->getGeneratedFile(),
            'createdAt' => $r->getCreatedAt()->format('c'),
            'updatedAt' => $r->getUpdatedAt()?->format('c'),
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

        $reports = $em->getRepository(Report::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $reports));
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

        $report = new Report();
        $report->setName($data['name']);
        $report->setContext($context);

        if (array_key_exists('description', $data)) {
            $report->setDescription($data['description']);
        }
        if (isset($data['type']) && in_array($data['type'], ['word', 'powerpoint'])) {
            $report->setType($data['type']);
        }

        $em->persist($report);
        $em->flush();

        return $this->json($this->serialize($report), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(Report $report): JsonResponse
    {
        return $this->json($this->serialize($report));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Report $report, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $report->setName($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $report->setDescription($data['description']);
        }
        if (isset($data['type']) && in_array($data['type'], ['word', 'powerpoint'])) {
            $report->setType($data['type']);
        }
        if (isset($data['title'])) {
            $report->setTitle($data['title']);
        }
        if (array_key_exists('subtitle', $data)) {
            $report->setSubtitle($data['subtitle']);
        }
        if (array_key_exists('showTableOfContents', $data)) {
            $report->setShowTableOfContents((bool) $data['showTableOfContents']);
        }
        if (array_key_exists('showAuthorsPage', $data)) {
            $report->setShowAuthorsPage((bool) $data['showAuthorsPage']);
        }
        if (array_key_exists('showRevisionPage', $data)) {
            $report->setShowRevisionPage((bool) $data['showRevisionPage']);
        }
        if (array_key_exists('showIllustrationsPage', $data)) {
            $report->setShowIllustrationsPage((bool) $data['showIllustrationsPage']);
        }
        if (array_key_exists('tags', $data)) {
            $report->setTags($data['tags']);
        }
        if (array_key_exists('blocks', $data)) {
            $report->setBlocks($data['blocks']);
        }
        if (array_key_exists('themeId', $data)) {
            if ($data['themeId']) {
                $theme = $em->getRepository(ReportTheme::class)->find($data['themeId']);
                $report->setTheme($theme);
            } else {
                $report->setTheme(null);
            }
        }

        $report->setUpdatedAt(new \DateTimeImmutable());
        $em->flush();

        return $this->json($this->serialize($report));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Report $report, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($report);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/generate', methods: ['POST'])]
    public function generate(Report $report, EntityManagerInterface $em, MessageBusInterface $bus): JsonResponse
    {
        if ($report->getGeneratingStatus()) {
            return $this->json(['error' => 'Generation already in progress'], Response::HTTP_CONFLICT);
        }

        $report->setGeneratingStatus('pending');
        $em->flush();

        $bus->dispatch(new GenerateReportMessage($report->getId()));

        return $this->json($this->serialize($report));
    }

    #[Route('/{id}/download', methods: ['GET'])]
    public function download(Report $report): Response
    {
        $file = $report->getGeneratedFile();
        if (!$file) {
            return $this->json(['error' => 'No generated file'], Response::HTTP_NOT_FOUND);
        }

        $path = '/var/www/var/' . $file;
        if (!file_exists($path)) {
            return $this->json(['error' => 'File not found'], Response::HTTP_NOT_FOUND);
        }

        $response = new BinaryFileResponse($path);
        $response->setContentDisposition(
            ResponseHeaderBag::DISPOSITION_INLINE,
            'report.pdf'
        );
        $response->headers->set('Content-Type', 'application/pdf');

        return $response;
    }
}

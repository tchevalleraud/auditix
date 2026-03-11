<?php

namespace App\Controller\Api;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/block-images')]
class BlockImageController extends AbstractController
{
    #[Route('', methods: ['POST'])]
    public function upload(Request $request): JsonResponse
    {
        $file = $request->files->get('image');

        if (!$file) {
            return $this->json(['error' => 'No file uploaded'], Response::HTTP_BAD_REQUEST);
        }

        $allowedMimes = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!in_array($file->getMimeType(), $allowedMimes, true)) {
            return $this->json(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG'], Response::HTTP_BAD_REQUEST);
        }

        if ($file->getSize() > 5 * 1024 * 1024) {
            return $this->json(['error' => 'File too large. Max 5MB'], Response::HTTP_BAD_REQUEST);
        }

        $uploadDir = $this->getParameter('kernel.project_dir') . '/var/uploads/block-images';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        $extension = $file->guessExtension() ?? 'png';
        $filename = uniqid('bi-') . '.' . $extension;
        $file->move($uploadDir, $filename);

        return $this->json([
            'filename' => $filename,
            'url' => '/api/block-images/' . $filename,
        ]);
    }

    #[Route('/{filename}', methods: ['GET'])]
    public function serve(string $filename): Response
    {
        $filename = basename($filename);
        $path = $this->getParameter('kernel.project_dir') . '/var/uploads/block-images/' . $filename;

        if (!file_exists($path)) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }

        $response = new BinaryFileResponse($path);
        $response->headers->set('Cache-Control', 'public, max-age=86400');

        return $response;
    }

    #[Route('/{filename}', methods: ['DELETE'])]
    public function delete(string $filename): JsonResponse
    {
        $filename = basename($filename);
        $path = $this->getParameter('kernel.project_dir') . '/var/uploads/block-images/' . $filename;

        if (file_exists($path)) {
            unlink($path);
        }

        return $this->json(['ok' => true]);
    }
}

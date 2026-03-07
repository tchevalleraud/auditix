<?php

namespace App\Controller\Api;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/logos')]
class LogoController extends AbstractController
{
    #[Route('/{filename}', methods: ['GET'])]
    public function serve(string $filename): Response
    {
        $filename = basename($filename);
        $path = $this->getParameter('kernel.project_dir') . '/var/uploads/logos/' . $filename;

        if (!file_exists($path)) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }

        $response = new BinaryFileResponse($path);
        $response->headers->set('Cache-Control', 'public, max-age=86400');

        return $response;
    }
}

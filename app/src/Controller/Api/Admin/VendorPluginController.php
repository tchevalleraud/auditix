<?php

namespace App\Controller\Api\Admin;

use App\Entity\InstalledPlugin;
use App\Entity\User;
use App\Plugin\PluginInstallException;
use App\Plugin\PluginInstaller;
use App\Plugin\PluginPackager;
use App\Repository\InstalledPluginRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/vendor-plugins')]
#[IsGranted('ROLE_ADMIN')]
class VendorPluginController extends AbstractController
{
    public function __construct(
        private readonly PluginInstaller $installer,
        private readonly InstalledPluginRepository $repo,
        private readonly PluginPackager $packager,
    ) {}

    #[Route('', methods: ['GET'])]
    public function index(): JsonResponse
    {
        $plugins = $this->repo->findBy([], ['identifier' => 'ASC']);
        return $this->json(array_map($this->serialize(...), $plugins));
    }

    #[Route('', methods: ['POST'])]
    public function upload(Request $request): JsonResponse
    {
        $file = $request->files->get('archive');
        if (!$file) {
            return $this->json(['error' => 'Missing "archive" file field.'], Response::HTTP_BAD_REQUEST);
        }

        $user = $this->getUser();
        $actor = $user instanceof User ? $user : null;
        $sourceIp = $request->getClientIp();

        try {
            $result = $this->installer->install($file, $actor, $sourceIp);
        } catch (PluginInstallException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }

        return $this->json(
            [
                'plugin' => $this->serialize($result['plugin']),
                'replaced' => $result['replaced'],
            ],
            $result['replaced'] ? Response::HTTP_OK : Response::HTTP_CREATED,
        );
    }

    #[Route('/{identifier}/export', methods: ['GET'])]
    public function export(string $identifier): BinaryFileResponse|JsonResponse
    {
        $plugin = $this->repo->findByIdentifier($identifier);
        if (!$plugin) {
            return $this->json(['error' => sprintf('Plugin "%s" is not installed.', $identifier)], Response::HTTP_NOT_FOUND);
        }

        $sourceDir = $plugin->getArchivePath();
        if (!is_dir($sourceDir)) {
            return $this->json(['error' => sprintf('Plugin source directory is missing on disk: %s', $sourceDir)], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $tempZip = tempnam(sys_get_temp_dir(), 'plugin-export-') . '.zip';
        try {
            $this->packager->packageDirectory($sourceDir, $tempZip);
        } catch (\Throwable $e) {
            @unlink($tempZip);
            return $this->json(['error' => 'Failed to package plugin: ' . $e->getMessage()], Response::HTTP_INTERNAL_SERVER_ERROR);
        }

        $filename = sprintf('%s-%s.zip', $plugin->getIdentifier(), $plugin->getVersion());

        $response = new BinaryFileResponse($tempZip);
        $response->headers->set('Content-Type', 'application/zip');
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, $filename);
        $response->deleteFileAfterSend(true);
        return $response;
    }

    #[Route('/{identifier}', methods: ['DELETE'])]
    public function delete(string $identifier, Request $request): JsonResponse
    {
        $user = $this->getUser();
        $actor = $user instanceof User ? $user : null;
        $sourceIp = $request->getClientIp();

        try {
            $this->installer->uninstall($identifier, $actor, $sourceIp);
        } catch (PluginInstallException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_NOT_FOUND);
        }

        return $this->json(['deleted' => true]);
    }

    private function serialize(InstalledPlugin $p): array
    {
        return [
            'id' => $p->getId(),
            'identifier' => $p->getIdentifier(),
            'version' => $p->getVersion(),
            'name' => $p->getName(),
            'description' => $p->getDescription(),
            'author' => $p->getAuthor(),
            'homepage' => $p->getHomepage(),
            'license' => $p->getLicense(),
            'sha256' => $p->getSha256(),
            'signatureStatus' => $p->getSignatureStatus(),
            'signatureKeyId' => $p->getSignatureKeyId(),
            'capabilities' => array_values((array) ($p->getManifest()['capabilities'] ?? [])),
            'manufacturers' => array_values((array) ($p->getManifest()['manufacturers'] ?? [])),
            'installedBy' => $p->getInstalledBy()?->getUserIdentifier(),
            'installedAt' => $p->getInstalledAt()->format('c'),
        ];
    }
}

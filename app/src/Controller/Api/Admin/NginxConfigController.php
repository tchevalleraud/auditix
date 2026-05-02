<?php

namespace App\Controller\Api\Admin;

use App\Entity\NginxConfig;
use App\Service\NginxConfigService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/server/nginx')]
#[IsGranted('ROLE_ADMIN')]
class NginxConfigController extends AbstractController
{
    public function __construct(
        private readonly NginxConfigService $service,
    ) {
    }

    #[Route('', methods: ['GET'])]
    public function get(): JsonResponse
    {
        return $this->json($this->serialize($this->service->get()));
    }

    #[Route('', methods: ['PUT'])]
    public function update(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $config = $this->service->get();

        if (array_key_exists('mode', $data)) {
            $mode = (string) $data['mode'];
            if (!in_array($mode, NginxConfig::MODES, true)) {
                return $this->json(['error' => 'invalid_mode'], Response::HTTP_BAD_REQUEST);
            }
            if ($mode !== NginxConfig::MODE_HTTP && !$config->hasCertificate()) {
                return $this->json(['error' => 'certificate_required'], Response::HTTP_BAD_REQUEST);
            }
            $config->setMode($mode);
        }
        if (array_key_exists('serverName', $data)) {
            $config->setServerName((string) $data['serverName']);
        }
        $this->service->saveSettings($config);

        return $this->json($this->serialize($config));
    }

    #[Route('/certificate', methods: ['PUT'])]
    public function uploadCertificate(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $cert = trim((string) ($data['certificate'] ?? ''));
        $key = trim((string) ($data['privateKey'] ?? ''));
        $chain = isset($data['chain']) ? trim((string) $data['chain']) : null;
        if ($cert === '' || $key === '') {
            return $this->json(['error' => 'certificate_and_key_required'], Response::HTTP_BAD_REQUEST);
        }
        if ($chain === '') {
            $chain = null;
        }

        try {
            $config = $this->service->get();
            $this->service->setCertificate($config, $cert, $key, $chain);
            return $this->json($this->serialize($config));
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }
    }

    #[Route('/certificate', methods: ['DELETE'])]
    public function deleteCertificate(): JsonResponse
    {
        $config = $this->service->get();
        $this->service->clearCertificate($config);
        return $this->json($this->serialize($config));
    }

    #[Route('/apply', methods: ['POST'])]
    public function apply(): JsonResponse
    {
        $config = $this->service->get();
        try {
            $result = $this->service->apply($config);
            return $this->json([
                'config' => $this->serialize($config),
                'reloaded' => $result['reloaded'],
                'message' => $result['message'],
            ]);
        } catch (\RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }
    }

    private function serialize(NginxConfig $c): array
    {
        return [
            'mode' => $c->getMode(),
            'serverName' => $c->getServerName(),
            'hasCertificate' => $c->hasCertificate(),
            'hasChain' => $c->getCertificateChainEncrypted() !== null,
            'certificateInfo' => $c->getCertificateInfo(),
            'appliedAt' => $c->getAppliedAt()?->format(\DateTimeInterface::ATOM),
            'updatedAt' => $c->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}

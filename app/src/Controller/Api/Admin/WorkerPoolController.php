<?php

namespace App\Controller\Api\Admin;

use App\Entity\WorkerPoolSettings;
use App\Repository\WorkerPoolSettingsRepository;
use App\Service\DockerApiClient;
use App\Service\RabbitMqManagementClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/server/workers')]
#[IsGranted('ROLE_ADMIN')]
class WorkerPoolController extends AbstractController
{
    public function __construct(
        private readonly WorkerPoolSettingsRepository $repository,
        private readonly EntityManagerInterface $em,
        private readonly DockerApiClient $docker,
        private readonly RabbitMqManagementClient $rabbit,
    ) {
    }

    #[Route('', methods: ['GET'])]
    public function list(): JsonResponse
    {
        $items = [];
        foreach ($this->repository->findAllOrdered() as $settings) {
            $items[] = $this->serialize($settings);
        }
        return $this->json(['items' => $items]);
    }

    #[Route('/{queue}', methods: ['PUT'])]
    public function update(string $queue, Request $request): JsonResponse
    {
        $settings = $this->repository->findByQueue($queue);
        if ($settings === null) {
            return $this->json(['error' => 'unknown_queue'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'invalid_body'], Response::HTTP_BAD_REQUEST);
        }

        if (array_key_exists('enabled', $data)) {
            $settings->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('minContainers', $data)) {
            $settings->setMinContainers((int) $data['minContainers']);
        }
        if (array_key_exists('maxContainers', $data)) {
            $settings->setMaxContainers((int) $data['maxContainers']);
        }
        if (array_key_exists('minProcessesPerContainer', $data)) {
            $settings->setMinProcessesPerContainer((int) $data['minProcessesPerContainer']);
        }
        if (array_key_exists('maxProcessesPerContainer', $data)) {
            $settings->setMaxProcessesPerContainer((int) $data['maxProcessesPerContainer']);
        }
        if (array_key_exists('scaleUpThreshold', $data)) {
            $settings->setScaleUpThreshold((int) $data['scaleUpThreshold']);
        }
        if (array_key_exists('scaleDownIdleSeconds', $data)) {
            $settings->setScaleDownIdleSeconds((int) $data['scaleDownIdleSeconds']);
        }
        if (array_key_exists('memoryLimitMb', $data)) {
            $settings->setMemoryLimitMb((int) $data['memoryLimitMb']);
        }

        $settings->touch();
        $this->em->flush();

        return $this->json($this->serialize($settings));
    }

    private function serialize(WorkerPoolSettings $settings): array
    {
        $stats = $this->rabbit->getQueueStats($settings->getQueue());
        $containers = $this->docker->isAvailable()
            ? $this->docker->listContainersByService($settings->getServiceName(), true)
            : [];

        $running = 0;
        foreach ($containers as $c) {
            if (strtolower((string) ($c['State'] ?? '')) === 'running') {
                $running++;
            }
        }

        return [
            'queue' => $settings->getQueue(),
            'serviceName' => $settings->getServiceName(),
            'enabled' => $settings->isEnabled(),
            'minContainers' => $settings->getMinContainers(),
            'maxContainers' => $settings->getMaxContainers(),
            'minProcessesPerContainer' => $settings->getMinProcessesPerContainer(),
            'maxProcessesPerContainer' => $settings->getMaxProcessesPerContainer(),
            'scaleUpThreshold' => $settings->getScaleUpThreshold(),
            'scaleDownIdleSeconds' => $settings->getScaleDownIdleSeconds(),
            'memoryLimitMb' => $settings->getMemoryLimitMb(),
            'updatedAt' => $settings->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            'live' => [
                'currentContainers' => $running,
                'totalContainers' => count($containers),
                'queueReady' => $stats['ready'] ?? null,
                'queueUnacked' => $stats['unacked'] ?? null,
                'queueConsumers' => $stats['consumers'] ?? null,
            ],
        ];
    }
}

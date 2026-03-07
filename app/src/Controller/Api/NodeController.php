<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\Node;
use App\Entity\Profile;
use App\Message\PingNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/nodes')]
class NodeController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
    ) {}

    private function serialize(Node $n): array
    {
        $manufacturer = $n->getManufacturer();
        $model = $n->getModel();
        $profile = $n->getProfile();
        $context = $n->getContext();

        return [
            'id' => $n->getId(),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'hostname' => $n->getHostname(),
            'score' => $n->getScore(),
            'policy' => $n->getPolicy(),
            'discoveredModel' => $n->getDiscoveredModel(),
            'discoveredVersion' => $n->getDiscoveredVersion(),
            'isReachable' => $n->getIsReachable(),
            'lastPingAt' => $n->getLastPingAt()?->format('c'),
            'monitoringEnabled' => $context?->isMonitoringEnabled() ?? false,
            'manufacturer' => $manufacturer ? [
                'id' => $manufacturer->getId(),
                'name' => $manufacturer->getName(),
                'logo' => $manufacturer->getLogo(),
            ] : null,
            'model' => $model ? [
                'id' => $model->getId(),
                'name' => $model->getName(),
            ] : null,
            'profile' => $profile ? [
                'id' => $profile->getId(),
                'name' => $profile->getName(),
            ] : null,
            'createdAt' => $n->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $nodes = $em->getRepository(Node::class)->findBy(
            ['context' => $contextId],
            ['ipAddress' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $nodes));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $ipAddress = $data['ipAddress'] ?? '';
        if (empty($ipAddress)) {
            return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
        }

        $node = new Node();
        $node->setContext($context);
        $node->setName($data['name'] ?? null);
        $node->setIpAddress($ipAddress);
        $node->setPolicy($data['policy'] ?? 'audit');

        if (!empty($data['manufacturerId'])) {
            $node->setManufacturer($em->getRepository(Editor::class)->find($data['manufacturerId']));
        }
        if (!empty($data['modelId'])) {
            $node->setModel($em->getRepository(DeviceModel::class)->find($data['modelId']));
        }
        if (!empty($data['profileId'])) {
            $node->setProfile($em->getRepository(Profile::class)->find($data['profileId']));
        }

        $em->persist($node);
        $em->flush();

        if ($context->isMonitoringEnabled()) {
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        return $this->json($this->serialize($node), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Node $node, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $ipAddress = $data['ipAddress'] ?? '';
        if (empty($ipAddress)) {
            return $this->json(['error' => 'IP address is required'], Response::HTTP_BAD_REQUEST);
        }

        $node->setName($data['name'] ?? null);
        $node->setIpAddress($ipAddress);
        $node->setPolicy($data['policy'] ?? $node->getPolicy());

        if (array_key_exists('manufacturerId', $data)) {
            $node->setManufacturer($data['manufacturerId'] ? $em->getRepository(Editor::class)->find($data['manufacturerId']) : null);
        }
        if (array_key_exists('modelId', $data)) {
            $node->setModel($data['modelId'] ? $em->getRepository(DeviceModel::class)->find($data['modelId']) : null);
        }
        if (array_key_exists('profileId', $data)) {
            $node->setProfile($data['profileId'] ? $em->getRepository(Profile::class)->find($data['profileId']) : null);
        }

        $em->flush();

        return $this->json($this->serialize($node));
    }

    #[Route('/ping', methods: ['POST'])]
    public function ping(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);

        foreach ($nodes as $node) {
            $node->setIsReachable(null);
            $this->bus->dispatch(new PingNodeMessage($node->getId()));
        }

        $em->flush();

        return $this->json(['dispatched' => count($nodes)]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Node $node, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($node);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}

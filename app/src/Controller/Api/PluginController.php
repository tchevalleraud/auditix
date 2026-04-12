<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\VendorPlugin;
use App\Message\SyncLifecycleMessage;
use App\Plugin\VendorPluginRegistry;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/plugins')]
class PluginController extends AbstractController
{
    public function __construct(
        private readonly VendorPluginRegistry $pluginRegistry,
    ) {}

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $allPlugins = $this->pluginRegistry->all();

        // Get database records for this context
        $dbPlugins = $em->getRepository(VendorPlugin::class)->findBy(['context' => $contextId]);
        $dbMap = [];
        foreach ($dbPlugins as $vp) {
            $dbMap[$vp->getPluginIdentifier()] = $vp;
        }

        $result = [];
        foreach ($allPlugins as $plugin) {
            $id = $plugin->getIdentifier();
            $dbRecord = $dbMap[$id] ?? null;

            $result[] = [
                'identifier' => $id,
                'displayName' => $plugin->getDisplayName(),
                'supportedManufacturers' => $plugin->getSupportedManufacturers(),
                'configurationSchema' => $plugin->getConfigurationSchema(),
                'enabled' => $dbRecord?->isEnabled() ?? false,
                'configuration' => $dbRecord?->getConfiguration(),
                'lastSyncAt' => $dbRecord?->getLastSyncAt()?->format('c'),
                'lastSyncStatus' => $dbRecord?->getLastSyncStatus(),
                'dbId' => $dbRecord?->getId(),
            ];
        }

        return $this->json($result);
    }

    #[Route('/{identifier}', methods: ['PUT'])]
    public function update(
        string $identifier,
        Request $request,
        EntityManagerInterface $em,
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $plugin = $this->pluginRegistry->get($identifier);
        if (!$plugin) return $this->json(['error' => 'Plugin not found'], Response::HTTP_NOT_FOUND);

        // Find or create database record
        $vp = $em->getRepository(VendorPlugin::class)->findOneBy([
            'context' => $context,
            'pluginIdentifier' => $identifier,
        ]);

        if (!$vp) {
            $vp = new VendorPlugin();
            $vp->setContext($context);
            $vp->setPluginIdentifier($identifier);
            $em->persist($vp);
        }

        if (array_key_exists('enabled', $data)) {
            $vp->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('configuration', $data)) {
            $vp->setConfiguration($data['configuration']);
        }

        $em->flush();

        return $this->json([
            'identifier' => $identifier,
            'displayName' => $plugin->getDisplayName(),
            'enabled' => $vp->isEnabled(),
            'configuration' => $vp->getConfiguration(),
            'lastSyncAt' => $vp->getLastSyncAt()?->format('c'),
            'lastSyncStatus' => $vp->getLastSyncStatus(),
        ]);
    }

    #[Route('/{identifier}/sync', methods: ['POST'])]
    public function sync(
        string $identifier,
        Request $request,
        EntityManagerInterface $em,
        MessageBusInterface $bus,
    ): JsonResponse {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $plugin = $this->pluginRegistry->get($identifier);
        if (!$plugin) return $this->json(['error' => 'Plugin not found'], Response::HTTP_NOT_FOUND);

        $bus->dispatch(new SyncLifecycleMessage($context->getId(), $identifier));

        return $this->json(['dispatched' => true]);
    }
}

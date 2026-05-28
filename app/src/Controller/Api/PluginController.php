<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\InstalledPlugin;
use App\Entity\Node;
use App\Entity\VendorPlugin;
use App\Message\RecalculateNodeScoreMessage;
use App\Message\SyncLifecycleMessage;
use App\Plugin\Capability\DependsOnPlugins;
use App\Plugin\Capability\ProvidesCommands;
use App\Plugin\Capability\ProvidesConfigurationSchema;
use App\Plugin\Capability\ProvidesDeviceModels;
use App\Plugin\Capability\ProvidesExtractionRules;
use App\Plugin\Capability\ProvidesLifecycleData;
use App\Plugin\Capability\ProvidesManufacturers;
use App\Plugin\PluginAssetsImporter;
use App\Plugin\VendorPluginInterface;
use App\Plugin\VendorPluginRegistry;
use App\Repository\InstalledPluginRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
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
        private readonly PluginAssetsImporter $assetsImporter,
    ) {}

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em, MessageBusInterface $bus): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) return $this->json([]);

        // Strict dependency enforcement: heal any plugin that is enabled while a
        // required plugin is not, before reporting state to the UI.
        $this->reconcileDependencies($context, $em, $bus);

        $allPlugins = $this->pluginRegistry->all();

        // Activation records for this context
        $dbPlugins = $em->getRepository(VendorPlugin::class)->findBy(['context' => $contextId]);
        $dbMap = [];
        foreach ($dbPlugins as $vp) {
            $dbMap[$vp->getPluginIdentifier()] = $vp;
        }

        // Global install metadata (signature status, etc.) — keyed by identifier
        $installed = $em->getRepository(InstalledPlugin::class)->findAll();
        $installedMap = [];
        foreach ($installed as $ip) {
            $installedMap[$ip->getIdentifier()] = $ip;
        }

        $result = [];
        foreach ($allPlugins as $plugin) {
            $id = $plugin->getIdentifier();
            $dbRecord = $dbMap[$id] ?? null;
            $installRecord = $installedMap[$id] ?? null;

            $result[] = [
                'identifier' => $id,
                'version' => $plugin->getVersion(),
                'displayName' => $plugin->getDisplayName(),
                'description' => $plugin->getDescription(),
                'supportedManufacturers' => $plugin->getSupportedManufacturers(),
                'capabilities' => $this->describeCapabilities($plugin),
                'requiredPlugins' => $plugin instanceof DependsOnPlugins ? array_values($plugin->getRequiredPlugins()) : [],
                'configurationSchema' => $plugin instanceof ProvidesConfigurationSchema
                    ? $plugin->getConfigurationSchema()
                    : [],
                'enabled' => $dbRecord?->isEnabled() ?? false,
                'configuration' => $dbRecord?->getConfiguration(),
                'lastSyncAt' => $dbRecord?->getLastSyncAt()?->format('c'),
                'lastSyncStatus' => $dbRecord?->getLastSyncStatus(),
                'dbId' => $dbRecord?->getId(),
                'signatureStatus' => $installRecord?->getSignatureStatus(),
                'signatureKeyId' => $installRecord?->getSignatureKeyId(),
                'iconUrl' => $installRecord !== null && self::hasIcon($installRecord->getManifest())
                    ? sprintf('/api/plugins/%s/icon', $id)
                    : null,
            ];
        }

        return $this->json($result);
    }

    /**
     * @return string[]
     */
    private function describeCapabilities(VendorPluginInterface $plugin): array
    {
        $caps = [];
        if ($plugin instanceof ProvidesManufacturers)        $caps[] = 'manufacturers';
        if ($plugin instanceof ProvidesDeviceModels)         $caps[] = 'models';
        if ($plugin instanceof ProvidesLifecycleData)        $caps[] = 'lifecycle';
        if ($plugin instanceof ProvidesCommands)             $caps[] = 'commands';
        if ($plugin instanceof ProvidesExtractionRules)      $caps[] = 'rules';
        if ($plugin instanceof ProvidesConfigurationSchema)  $caps[] = 'configuration';
        return $caps;
    }

    /**
     * Required plugins of $plugin that are NOT currently enabled in $context.
     *
     * @return array<string,string> identifier => display name
     */
    private function missingRequiredPlugins(DependsOnPlugins $plugin, Context $context, EntityManagerInterface $em): array
    {
        $missing = [];
        foreach ($plugin->getRequiredPlugins() as $reqId) {
            $vp = $em->getRepository(VendorPlugin::class)->findOneBy([
                'context' => $context,
                'pluginIdentifier' => $reqId,
            ]);
            if (!$vp || !$vp->isEnabled()) {
                $missing[$reqId] = $this->pluginRegistry->get($reqId)?->getDisplayName() ?? $reqId;
            }
        }
        return $missing;
    }

    /**
     * Strict dependency enforcement: any plugin enabled in $context whose required
     * plugins are not all enabled is forcibly disabled (its assets purged), exactly
     * as a manual disable would. Repeated until stable, since disabling one plugin
     * can in turn break a further dependent.
     */
    private function reconcileDependencies(Context $context, EntityManagerInterface $em, MessageBusInterface $bus): void
    {
        $repo = $em->getRepository(VendorPlugin::class);
        $guard = count($this->pluginRegistry->all()) + 1;

        do {
            $changed = false;
            foreach ($this->pluginRegistry->all() as $id => $plugin) {
                if (!$plugin instanceof DependsOnPlugins) {
                    continue;
                }
                $vp = $repo->findOneBy(['context' => $context, 'pluginIdentifier' => $id]);
                if (!$vp || !$vp->isEnabled() || $this->missingRequiredPlugins($plugin, $context, $em) === []) {
                    continue;
                }

                $vp->setEnabled(false);
                $em->flush();
                $this->assetsImporter->remove($id, $context);
                foreach ($em->getRepository(Node::class)->findBy(['context' => $context]) as $node) {
                    $bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
                }
                $changed = true;
            }
        } while ($changed && --$guard > 0);
    }

    /**
     * Plugins enabled in $context that declare $identifier as a required plugin.
     *
     * @return array<string,string> identifier => display name
     */
    private function enabledDependents(string $identifier, Context $context, EntityManagerInterface $em): array
    {
        $dependents = [];
        foreach ($this->pluginRegistry->all() as $id => $plugin) {
            if (!$plugin instanceof DependsOnPlugins || !in_array($identifier, $plugin->getRequiredPlugins(), true)) {
                continue;
            }
            $vp = $em->getRepository(VendorPlugin::class)->findOneBy([
                'context' => $context,
                'pluginIdentifier' => $id,
            ]);
            if ($vp && $vp->isEnabled()) {
                $dependents[$id] = $plugin->getDisplayName();
            }
        }
        return $dependents;
    }

    #[Route('/{identifier}', methods: ['PUT'])]
    public function update(
        string $identifier,
        Request $request,
        EntityManagerInterface $em,
        MessageBusInterface $bus,
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

        $wasEnabled = $vp->isEnabled();
        $intendedEnabled = array_key_exists('enabled', $data) ? (bool) $data['enabled'] : $wasEnabled;

        // Enabling: every required plugin must already be enabled in this context.
        if ($intendedEnabled && !$wasEnabled && $plugin instanceof DependsOnPlugins) {
            $missing = $this->missingRequiredPlugins($plugin, $context, $em);
            if ($missing !== []) {
                return $this->json([
                    'error' => sprintf(
                        'This plugin requires the following plugin(s) to be enabled first: %s.',
                        implode(', ', array_values($missing)),
                    ),
                    'missingDependencies' => array_keys($missing),
                ], Response::HTTP_CONFLICT);
            }
        }

        // Disabling: refuse while an enabled plugin in this context still depends on it.
        if (!$intendedEnabled && $wasEnabled) {
            $dependents = $this->enabledDependents($identifier, $context, $em);
            if ($dependents !== []) {
                return $this->json([
                    'error' => sprintf(
                        'This plugin is required by the following enabled plugin(s): %s. Disable them first.',
                        implode(', ', array_values($dependents)),
                    ),
                    'blockingDependents' => array_keys($dependents),
                ], Response::HTTP_CONFLICT);
            }
        }

        if (array_key_exists('enabled', $data)) {
            $vp->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('configuration', $data)) {
            $vp->setConfiguration($data['configuration']);
        }

        $em->flush();

        // Sync plugin assets (commands/rules) with activation state.
        if (!$wasEnabled && $vp->isEnabled()) {
            $this->assetsImporter->import($plugin, $context);
        } elseif ($wasEnabled && !$vp->isEnabled()) {
            $this->assetsImporter->remove($identifier, $context);
            // Removing the plugin's ProductRanges drops the lifecycle data feeding
            // the System Updates score — recompute so node grades reset to neutral.
            foreach ($em->getRepository(Node::class)->findBy(['context' => $context]) as $node) {
                $bus->dispatch(new RecalculateNodeScoreMessage($node->getId()));
            }
        }

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

    #[Route('/{identifier}/icon', methods: ['GET'])]
    public function icon(string $identifier, InstalledPluginRepository $installedRepo): Response
    {
        $installed = $installedRepo->findByIdentifier($identifier);
        if (!$installed) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }

        $manifest = $installed->getManifest();
        if (!self::hasIcon($manifest)) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }
        $iconRel = ltrim((string) $manifest['icon'], '/');

        // Defense in depth — resolved path must stay inside the plugin's archive dir.
        $archive = realpath($installed->getArchivePath());
        if ($archive === false) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }
        $target = realpath($archive . DIRECTORY_SEPARATOR . $iconRel);
        if ($target === false || !is_file($target) || strncmp($target, $archive . DIRECTORY_SEPARATOR, strlen($archive) + 1) !== 0) {
            return new Response('Not found', Response::HTTP_NOT_FOUND);
        }

        $response = new BinaryFileResponse($target);
        $response->headers->set('Cache-Control', 'public, max-age=86400');
        return $response;
    }

    /**
     * @param array<string,mixed> $manifest
     */
    private static function hasIcon(array $manifest): bool
    {
        return isset($manifest['icon']) && is_string($manifest['icon']) && trim($manifest['icon']) !== '';
    }
}

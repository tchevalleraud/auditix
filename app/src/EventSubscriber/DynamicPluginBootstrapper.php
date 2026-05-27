<?php

namespace App\EventSubscriber;

use App\Plugin\DynamicPluginLoader;
use App\Repository\InstalledPluginRepository;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\ConsoleEvents;
use Symfony\Component\Console\Event\ConsoleCommandEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Charge les plugins uploadés au début de chaque cycle (HTTP request ou commande CLI).
 *
 * Le chargement est idempotent : un flag interne garantit qu'il n'a lieu
 * qu'une seule fois par cycle de vie du process PHP (pas à chaque sous-requête).
 *
 * Priorité maximale pour s'assurer que le registry est complet avant que
 * les controllers ou handlers de messages n'y accèdent.
 */
class DynamicPluginBootstrapper implements EventSubscriberInterface
{
    private bool $bootstrapped = false;

    public function __construct(
        private readonly InstalledPluginRepository $repo,
        private readonly DynamicPluginLoader $loader,
        private readonly LoggerInterface $logger,
    ) {}

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 4096],
            ConsoleEvents::COMMAND => ['onCommand', 4096],
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $this->bootstrap();
    }

    public function onCommand(ConsoleCommandEvent $event): void
    {
        $this->bootstrap();
    }

    private function bootstrap(): void
    {
        if ($this->bootstrapped) {
            return;
        }
        $this->bootstrapped = true;

        try {
            $plugins = $this->repo->findLoadable();
        } catch (\Throwable $e) {
            // Table may not exist yet (fresh install, before migrations).
            // No plugins to load — silently skip.
            $this->logger->debug('Skipping dynamic plugin bootstrap (table not ready?)', [
                'error' => $e->getMessage(),
            ]);
            return;
        }

        foreach ($plugins as $installed) {
            $manifest = $installed->getManifest();
            $namespace = (string) ($manifest['entrypoint']['namespace'] ?? '');
            $entryClass = (string) ($manifest['entrypoint']['class'] ?? '');
            $sourceDir = rtrim($installed->getArchivePath(), '/') . '/src';

            if ($namespace === '' || $entryClass === '') {
                $this->logger->warning('Installed plugin has invalid entrypoint, skipping', [
                    'identifier' => $installed->getIdentifier(),
                ]);
                continue;
            }

            $this->loader->loadPlugin($namespace, $sourceDir, $entryClass);
        }
    }
}

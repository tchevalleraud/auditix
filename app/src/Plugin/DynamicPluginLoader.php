<?php

namespace App\Plugin;

use Psr\Log\LoggerInterface;

/**
 * Charge les plugins uploadés depuis le filesystem et les enregistre dans le registre.
 *
 * En Phase 1 (squelette) : le service expose les primitives de chargement
 * (autoload PSR-4 isolé + instanciation + register). Aucun appel automatique
 * au boot du kernel : ce branchement viendra en Phase 2 quand l'entité
 * InstalledPlugin et l'endpoint d'upload existeront.
 */
class DynamicPluginLoader
{
    public function __construct(
        private readonly VendorPluginRegistry $registry,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Enregistre un namespace PSR-4 vers un dossier de sources, instancie la classe
     * d'entrée, et l'enregistre dans le registry.
     *
     * @param string $namespace      Namespace racine du plugin, ex: "Auditix\\Plugin\\HelloWorld"
     * @param string $sourceDir      Chemin absolu vers le dossier src/ du plugin
     * @param string $entryClass     Nom court de la classe principale, ex: "HelloWorldPlugin"
     * @param array<string,mixed> $constructorArgs  Args ordonnés à passer au constructeur (Phase 2+ : DI ciblée)
     *
     * @return VendorPluginInterface|null Le plugin chargé, ou null en cas d'erreur (loggée).
     */
    public function loadPlugin(
        string $namespace,
        string $sourceDir,
        string $entryClass,
        array $constructorArgs = [],
    ): ?VendorPluginInterface {
        if (!is_dir($sourceDir)) {
            $this->logger->error('Plugin source directory does not exist', [
                'sourceDir' => $sourceDir,
                'namespace' => $namespace,
            ]);
            return null;
        }

        $this->registerNamespace($namespace, $sourceDir);

        $fqcn = rtrim($namespace, '\\') . '\\' . $entryClass;

        if (!class_exists($fqcn)) {
            $this->logger->error('Plugin entry class not found', [
                'fqcn' => $fqcn,
                'sourceDir' => $sourceDir,
            ]);
            return null;
        }

        try {
            /** @var object $instance */
            $instance = new $fqcn(...array_values($constructorArgs));
        } catch (\Throwable $e) {
            $this->logger->error('Failed to instantiate plugin entry class', [
                'fqcn' => $fqcn,
                'error' => $e->getMessage(),
            ]);
            return null;
        }

        if (!$instance instanceof VendorPluginInterface) {
            $this->logger->error('Plugin entry class does not implement VendorPluginInterface', [
                'fqcn' => $fqcn,
            ]);
            return null;
        }

        $this->registry->register($instance);

        $this->logger->info('Plugin loaded dynamically', [
            'identifier' => $instance->getIdentifier(),
            'version' => $instance->getVersion(),
            'fqcn' => $fqcn,
        ]);

        return $instance;
    }

    /**
     * Enregistre un autoloader PSR-4 isolé pour le namespace donné.
     * Plusieurs appels avec le même namespace sont sans effet (idempotent).
     */
    private function registerNamespace(string $namespace, string $sourceDir): void
    {
        static $registered = [];

        $key = $namespace . '|' . $sourceDir;
        if (isset($registered[$key])) {
            return;
        }
        $registered[$key] = true;

        $prefix = rtrim($namespace, '\\') . '\\';
        $baseDir = rtrim($sourceDir, '/\\') . DIRECTORY_SEPARATOR;
        $prefixLen = strlen($prefix);

        spl_autoload_register(function (string $class) use ($prefix, $prefixLen, $baseDir): void {
            if (strncmp($class, $prefix, $prefixLen) !== 0) {
                return;
            }
            $relative = substr($class, $prefixLen);
            $file = $baseDir . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';
            if (is_file($file)) {
                require $file;
            }
        });
    }
}

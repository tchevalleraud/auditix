<?php

namespace App\Plugin;

use App\Entity\AuditLog;
use App\Entity\InstalledPlugin;
use App\Entity\User;
use App\Entity\VendorPlugin;
use App\Repository\InstalledPluginRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Installe / désinstalle / met à jour les Vendor Plugins uploadés.
 *
 * Stockage : %kernel.project_dir%/var/plugins/{identifier}/{version}/
 * Validation : taille, extension, protection zip-slip, manifest valide.
 * Audit : chaque opération est journalisée dans audit_log.
 *
 * Signature : en Phase 2, tous les plugins sans signature.sig sont marqués
 * `community`. La vérification Ed25519 (status `official` / `invalid`) arrive
 * en Phase 4.
 */
class PluginInstaller
{
    public const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
    public const MAX_FILES = 1000;

    private readonly Filesystem $fs;
    private readonly string $pluginsDir;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly InstalledPluginRepository $installedRepo,
        private readonly PluginManifestValidator $validator,
        private readonly PluginSignatureVerifier $signatureVerifier,
        private readonly LoggerInterface $logger,
        #[Autowire('%kernel.project_dir%')] string $projectDir,
    ) {
        $this->fs = new Filesystem();
        $this->pluginsDir = rtrim($projectDir, '/') . '/var/plugins';
    }

    public function getPluginsDir(): string
    {
        return $this->pluginsDir;
    }

    /**
     * Installe ou met à jour un plugin depuis un fichier ZIP uploadé.
     *
     * @return array{plugin: InstalledPlugin, replaced: bool}
     * @throws PluginInstallException
     */
    public function install(UploadedFile $upload, ?User $actor, ?string $sourceIp): array
    {
        $this->ensureZipExtensionAvailable();

        if ($upload->getSize() > self::MAX_ARCHIVE_BYTES) {
            throw new PluginInstallException(sprintf(
                'Archive too large (max %d MB).',
                (int) (self::MAX_ARCHIVE_BYTES / 1024 / 1024),
            ));
        }

        $ext = strtolower($upload->getClientOriginalExtension());
        if ($ext !== 'zip') {
            throw new PluginInstallException('Only .zip archives are accepted.');
        }

        $archivePath = $upload->getRealPath();
        if (!is_string($archivePath) || !is_file($archivePath)) {
            throw new PluginInstallException('Uploaded file is not readable.');
        }

        $sha256 = hash_file('sha256', $archivePath);
        if (!is_string($sha256)) {
            throw new PluginInstallException('Failed to compute archive checksum.');
        }

        // Extract to a temp dir first; only commit to the final location after validation.
        $tempDir = $this->makeTempDir();
        try {
            $this->extractZip($archivePath, $tempDir);

            $manifestPath = $tempDir . '/plugin.yaml';
            if (!is_file($manifestPath)) {
                throw new PluginInstallException('plugin.yaml is missing at the archive root.');
            }

            $result = $this->validator->validateFile($manifestPath);
            if (!$result['valid']) {
                throw new PluginInstallException('Invalid manifest: ' . implode(' / ', $result['errors']));
            }
            $manifest = $result['manifest'];

            $identifier = (string) $manifest['identifier'];
            $version = (string) $manifest['version'];
            $entryNs = (string) $manifest['entrypoint']['namespace'];
            $entryClass = (string) $manifest['entrypoint']['class'];

            // Verify the entry class file exists in src/
            $srcDir = $tempDir . '/src';
            if (!is_dir($srcDir)) {
                throw new PluginInstallException('src/ directory is missing in the archive.');
            }
            $entryFile = $srcDir . '/' . $entryClass . '.php';
            if (!is_file($entryFile)) {
                throw new PluginInstallException(sprintf(
                    'Entry class file not found: src/%s.php',
                    $entryClass,
                ));
            }

            // Signature verification (Ed25519 against trusted keys from config/plugin_keys.yaml).
            $sigResult = $this->signatureVerifier->verify($tempDir, $manifest);
            $signatureStatus = $sigResult['status'];
            $signatureKeyId = $sigResult['key_id'];

            // Final destination
            $destDir = $this->pluginsDir . '/' . $identifier . '/' . $version;

            $existing = $this->installedRepo->findByIdentifier($identifier);
            $replaced = $existing !== null;

            // Atomic-ish swap: remove old dest if any, then rename temp into place.
            if (is_dir($destDir)) {
                $this->fs->remove($destDir);
            }
            $this->fs->mkdir(dirname($destDir));
            $this->fs->rename($tempDir, $destDir);
            $tempDir = null; // consumed

            // If we replaced an older version, also wipe its old folder (only if path differs).
            if ($existing && $existing->getArchivePath() !== $destDir && is_dir($existing->getArchivePath())) {
                $this->fs->remove($existing->getArchivePath());
            }

            $entity = $existing ?? new InstalledPlugin();
            $entity->setIdentifier($identifier);
            $entity->setVersion($version);
            $entity->setName((string) $manifest['name']);
            $entity->setDescription(isset($manifest['description']) ? (string) $manifest['description'] : null);
            $entity->setAuthor(isset($manifest['author']) ? (string) $manifest['author'] : null);
            $entity->setHomepage(isset($manifest['homepage']) ? (string) $manifest['homepage'] : null);
            $entity->setLicense(isset($manifest['license']) ? (string) $manifest['license'] : null);
            $entity->setManifest($manifest);
            $entity->setArchivePath($destDir);
            $entity->setSha256($sha256);
            $entity->setSignatureStatus($signatureStatus);
            $entity->setSignatureKeyId($signatureKeyId);
            $entity->setInstalledBy($actor);
            $entity->setInstalledAt(new \DateTimeImmutable());

            $this->em->persist($entity);
            $this->em->flush();

            $this->writeAudit(
                $replaced ? 'plugin.update' : 'plugin.install',
                sprintf('Plugin "%s" %s (v%s).', $identifier, $replaced ? 'updated' : 'installed', $version),
                $actor,
                $sourceIp,
                [
                    'identifier' => $identifier,
                    'version' => $version,
                    'sha256' => $sha256,
                    'signature_status' => $signatureStatus,
                    'entrypoint' => $entryNs . '\\' . $entryClass,
                ],
            );

            return ['plugin' => $entity, 'replaced' => $replaced];
        } catch (PluginInstallException $e) {
            throw $e;
        } catch (\Throwable $e) {
            $this->logger->error('Unexpected error during plugin install', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            throw new PluginInstallException('Unexpected error: ' . $e->getMessage(), previous: $e);
        } finally {
            if ($tempDir !== null && is_dir($tempDir)) {
                $this->fs->remove($tempDir);
            }
        }
    }

    /**
     * Désinstalle un plugin par identifiant.
     * @throws PluginInstallException si le plugin n'existe pas.
     */
    public function uninstall(string $identifier, ?User $actor, ?string $sourceIp): void
    {
        $entity = $this->installedRepo->findByIdentifier($identifier);
        if (!$entity) {
            throw new PluginInstallException(sprintf('Plugin "%s" is not installed.', $identifier));
        }

        // Refuse if the plugin is still enabled in at least one context.
        $activeActivations = $this->em->getRepository(VendorPlugin::class)
            ->findBy(['pluginIdentifier' => $identifier, 'enabled' => true]);
        if ($activeActivations !== []) {
            $contextNames = array_map(
                fn(VendorPlugin $vp) => $vp->getContext()?->getName() ?? sprintf('#%d', $vp->getContext()?->getId() ?? 0),
                $activeActivations,
            );
            throw new PluginInstallException(sprintf(
                'Plugin "%s" is still enabled in: %s. Disable it in those contexts first.',
                $identifier,
                implode(', ', $contextNames),
            ));
        }

        $version = $entity->getVersion();
        $archivePath = $entity->getArchivePath();

        if (is_dir($archivePath)) {
            $this->fs->remove($archivePath);
        }
        // Also clean the parent identifier folder if now empty
        $parentDir = dirname($archivePath);
        if (is_dir($parentDir) && $this->isEmptyDir($parentDir)) {
            $this->fs->remove($parentDir);
        }

        $this->em->remove($entity);
        $this->em->flush();

        $this->writeAudit(
            'plugin.uninstall',
            sprintf('Plugin "%s" uninstalled (v%s).', $identifier, $version),
            $actor,
            $sourceIp,
            ['identifier' => $identifier, 'version' => $version],
        );
    }

    private function ensureZipExtensionAvailable(): void
    {
        if (!class_exists(\ZipArchive::class)) {
            throw new PluginInstallException('PHP ZipArchive extension is not available on this server.');
        }
    }

    private function makeTempDir(): string
    {
        $base = sys_get_temp_dir() . '/auditix-plugin-install-' . bin2hex(random_bytes(8));
        $this->fs->mkdir($base, 0700);
        return $base;
    }

    /**
     * Extracts a zip with zip-slip protection and file count guard.
     */
    private function extractZip(string $archivePath, string $destDir): void
    {
        $zip = new \ZipArchive();
        $opened = $zip->open($archivePath);
        if ($opened !== true) {
            throw new PluginInstallException(sprintf('Cannot open ZIP archive (code %s).', (string) $opened));
        }

        try {
            if ($zip->numFiles > self::MAX_FILES) {
                throw new PluginInstallException(sprintf('Archive has too many files (max %d).', self::MAX_FILES));
            }

            $realDest = realpath($destDir);
            if ($realDest === false) {
                throw new PluginInstallException('Cannot resolve destination directory.');
            }

            for ($i = 0; $i < $zip->numFiles; $i++) {
                $entryName = $zip->getNameIndex($i);
                if ($entryName === false) continue;

                // Normalize and reject path traversal
                $normalized = str_replace('\\', '/', $entryName);
                if ($normalized === '' || str_starts_with($normalized, '/') || str_contains($normalized, '../')) {
                    throw new PluginInstallException(sprintf('Unsafe path in archive: %s', $entryName));
                }

                $target = $realDest . '/' . $normalized;
                $targetDir = str_ends_with($normalized, '/') ? $target : dirname($target);
                if (!is_dir($targetDir)) {
                    $this->fs->mkdir($targetDir);
                }

                // Re-check resolved target is within destDir
                $parentReal = realpath($targetDir);
                if ($parentReal === false || strncmp($parentReal, $realDest, strlen($realDest)) !== 0) {
                    throw new PluginInstallException(sprintf('Path escapes destination: %s', $entryName));
                }

                if (str_ends_with($normalized, '/')) continue; // directory entry

                $stream = $zip->getStream($entryName);
                if ($stream === false) {
                    throw new PluginInstallException(sprintf('Cannot read archive entry: %s', $entryName));
                }
                $written = file_put_contents($target, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
                if ($written === false) {
                    throw new PluginInstallException(sprintf('Cannot write extracted file: %s', $entryName));
                }
            }
        } finally {
            $zip->close();
        }
    }

    private function isEmptyDir(string $dir): bool
    {
        $entries = scandir($dir);
        if ($entries === false) return false;
        return array_values(array_diff($entries, ['.', '..'])) === [];
    }

    private function writeAudit(string $action, string $message, ?User $actor, ?string $sourceIp, array $context): void
    {
        $log = new AuditLog();
        $log->setLevel(AuditLog::LEVEL_INFO);
        $log->setCategory(AuditLog::CATEGORY_SYSTEM);
        $log->setAction($action);
        $log->setActor($actor?->getUserIdentifier());
        $log->setSourceIp($sourceIp);
        $log->setMessage($message);
        $log->setContext($context);
        $this->em->persist($log);
        $this->em->flush();
    }
}

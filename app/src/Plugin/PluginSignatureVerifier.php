<?php

namespace App\Plugin;

use App\Entity\InstalledPlugin;

/**
 * Verifies Ed25519 detached signatures on extracted plugin trees.
 *
 * Wire format :
 *  - The signature is computed over a SHA-512 digest of all files in the
 *    plugin directory **except** signature.sig itself, with each file
 *    contributing its relative path and a SHA-256 of its contents.
 *  - Files are visited in canonical (sorted) order to guarantee determinism.
 *  - signature.sig holds the raw 64-byte Ed25519 detached signature.
 *  - The manifest's `signature.key_id` selects the trusted public key.
 *
 * Outcomes :
 *  - No signature.sig AND no manifest.signature   → status `community`
 *  - signature.sig present, key_id known, valid   → status `official`
 *  - signature.sig present + key_id unknown OR invalid → throws (install refused)
 *  - signature.sig and manifest.signature inconsistent  → throws
 */
class PluginSignatureVerifier
{
    public function __construct(
        private readonly PluginKeyRegistry $keys,
    ) {}

    /**
     * @param string $extractedDir absolute path to the extracted plugin directory
     * @param array<string,mixed> $manifest parsed plugin.yaml
     *
     * @return array{status: string, key_id: ?string}
     * @throws PluginInstallException if a signature is present but invalid
     */
    public function verify(string $extractedDir, array $manifest): array
    {
        $sigPath = $extractedDir . '/signature.sig';
        $manifestSig = $manifest['signature'] ?? null;

        $hasSigFile = is_file($sigPath);
        $hasManifestSig = is_array($manifestSig);

        if (!$hasSigFile && !$hasManifestSig) {
            return ['status' => InstalledPlugin::SIGNATURE_COMMUNITY, 'key_id' => null];
        }
        if ($hasSigFile XOR $hasManifestSig) {
            throw new PluginInstallException(
                'Inconsistent signature: signature.sig and manifest.signature must be present together.'
            );
        }

        $keyId = (string) ($manifestSig['key_id'] ?? '');
        $algorithm = (string) ($manifestSig['algorithm'] ?? '');
        if ($algorithm !== 'ed25519' || $keyId === '') {
            throw new PluginInstallException('Unsupported or missing signature algorithm / key_id.');
        }

        $publicKey = $this->keys->getPublicKey($keyId);
        if ($publicKey === null) {
            throw new PluginInstallException(sprintf(
                'Unknown signing key "%s". Install refused. Known keys: [%s].',
                $keyId,
                implode(', ', $this->keys->listKeyIds()) ?: '(none)',
            ));
        }

        $signature = file_get_contents($sigPath);
        if ($signature === false || strlen($signature) !== SODIUM_CRYPTO_SIGN_BYTES) {
            throw new PluginInstallException('signature.sig has invalid length.');
        }

        $digest = self::computeDigest($extractedDir);

        if (!sodium_crypto_sign_verify_detached($signature, $digest, $publicKey)) {
            throw new PluginInstallException('Signature verification failed.');
        }

        return ['status' => InstalledPlugin::SIGNATURE_OFFICIAL, 'key_id' => $keyId];
    }

    /**
     * Compute a deterministic SHA-512 digest over the plugin tree.
     * Public so the CLI signing command can produce a matching digest.
     */
    public static function computeDigest(string $dir): string
    {
        $files = self::listFiles($dir);
        sort($files, SORT_STRING);

        $ctx = hash_init('sha512');
        foreach ($files as $relPath) {
            if ($relPath === 'signature.sig') continue;
            $fileHash = hash_file('sha256', $dir . '/' . $relPath, true);
            if ($fileHash === false) {
                throw new \RuntimeException(sprintf('Cannot hash file: %s', $relPath));
            }
            hash_update($ctx, $relPath);
            hash_update($ctx, "\0");
            hash_update($ctx, $fileHash);
            hash_update($ctx, "\0");
        }
        return hash_final($ctx, true);
    }

    /**
     * @return string[] relative paths of regular files under $dir
     */
    private static function listFiles(string $dir): array
    {
        $result = [];
        $dir = rtrim($dir, '/');
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST,
        );
        foreach ($iterator as $file) {
            /** @var \SplFileInfo $file */
            if (!$file->isFile()) continue;
            $rel = substr($file->getPathname(), strlen($dir) + 1);
            $result[] = str_replace('\\', '/', $rel);
        }
        return $result;
    }
}

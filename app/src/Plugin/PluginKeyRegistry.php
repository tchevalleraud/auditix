<?php

namespace App\Plugin;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Yaml\Yaml;

/**
 * Holds the trusted Ed25519 public keys used to verify "official" plugins.
 *
 * Source : config/plugin_keys.yaml (parsed lazily on first access).
 */
class PluginKeyRegistry
{
    /** @var array<string, string>|null Map key_id => raw 32-byte Ed25519 public key */
    private ?array $keys = null;

    private readonly string $configPath;

    public function __construct(
        #[Autowire('%kernel.project_dir%')] string $projectDir,
    ) {
        $this->configPath = rtrim($projectDir, '/') . '/config/plugin_keys.yaml';
    }

    public function getPublicKey(string $keyId): ?string
    {
        $this->load();
        return $this->keys[$keyId] ?? null;
    }

    public function hasKey(string $keyId): bool
    {
        $this->load();
        return isset($this->keys[$keyId]);
    }

    /**
     * @return string[] List of known key_ids
     */
    public function listKeyIds(): array
    {
        $this->load();
        return array_keys($this->keys);
    }

    private function load(): void
    {
        if ($this->keys !== null) return;

        $this->keys = [];
        if (!is_file($this->configPath)) return;

        $parsed = Yaml::parseFile($this->configPath);
        if (!is_array($parsed) || !isset($parsed['keys']) || !is_array($parsed['keys'])) return;

        foreach ($parsed['keys'] as $entry) {
            if (!is_array($entry)) continue;
            $keyId = $entry['key_id'] ?? null;
            $algo = $entry['algorithm'] ?? null;
            $pubB64 = $entry['public_key'] ?? null;

            if (!is_string($keyId) || $keyId === '' || $algo !== 'ed25519' || !is_string($pubB64)) {
                continue;
            }
            $raw = base64_decode($pubB64, true);
            if ($raw === false || strlen($raw) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
                continue;
            }
            $this->keys[$keyId] = $raw;
        }
    }
}

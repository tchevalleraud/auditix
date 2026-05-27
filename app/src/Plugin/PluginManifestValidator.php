<?php

namespace App\Plugin;

use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

/**
 * Valide un manifest plugin.yaml.
 *
 * Retourne un résultat structuré : { valid: bool, manifest: array, errors: string[] }.
 * Ne lève pas d'exception : les erreurs de parse YAML ou de schéma sont remontées dans `errors`.
 */
class PluginManifestValidator
{
    public const SUPPORTED_MANIFEST_VERSION = 1;

    private const IDENTIFIER_PATTERN = '/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/';
    private const SEMVER_PATTERN = '/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/';

    /**
     * @return array{valid: bool, manifest: array<string,mixed>, errors: string[]}
     */
    public function validateFile(string $manifestPath): array
    {
        if (!is_file($manifestPath)) {
            return $this->fail([sprintf('Manifest file not found: %s', $manifestPath)]);
        }

        try {
            $parsed = Yaml::parseFile($manifestPath);
        } catch (ParseException $e) {
            return $this->fail([sprintf('YAML parse error: %s', $e->getMessage())]);
        }

        if (!is_array($parsed)) {
            return $this->fail(['Manifest must be a YAML mapping at the root.']);
        }

        return $this->validateArray($parsed);
    }

    /**
     * @param array<string,mixed> $manifest
     * @return array{valid: bool, manifest: array<string,mixed>, errors: string[]}
     */
    public function validateArray(array $manifest): array
    {
        $errors = [];

        $manifestVersion = $manifest['manifest_version'] ?? null;
        if ($manifestVersion !== self::SUPPORTED_MANIFEST_VERSION) {
            $errors[] = sprintf(
                'manifest_version must be %d (got %s).',
                self::SUPPORTED_MANIFEST_VERSION,
                var_export($manifestVersion, true),
            );
        }

        $identifier = $manifest['identifier'] ?? null;
        if (!is_string($identifier) || preg_match(self::IDENTIFIER_PATTERN, $identifier) !== 1) {
            $errors[] = 'identifier must be a kebab-case string matching [a-z0-9][a-z0-9_-]*[a-z0-9].';
        } elseif (strlen($identifier) > 128) {
            $errors[] = 'identifier must not exceed 128 characters.';
        }

        $version = $manifest['version'] ?? null;
        if (!is_string($version) || preg_match(self::SEMVER_PATTERN, $version) !== 1) {
            $errors[] = 'version must be a semver string (e.g. "1.2.0").';
        }

        $name = $manifest['name'] ?? null;
        if (!is_string($name) || trim($name) === '') {
            $errors[] = 'name must be a non-empty string.';
        }

        $entrypoint = $manifest['entrypoint'] ?? null;
        if (!is_array($entrypoint)) {
            $errors[] = 'entrypoint must be an object with `namespace` and `class`.';
        } else {
            $namespace = $entrypoint['namespace'] ?? null;
            $class = $entrypoint['class'] ?? null;
            if (!is_string($namespace) || $namespace === '') {
                $errors[] = 'entrypoint.namespace must be a non-empty string.';
            } elseif (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\\\\[A-Za-z_][A-Za-z0-9_]*)*$/', $namespace)) {
                $errors[] = 'entrypoint.namespace must be a valid PHP namespace.';
            }
            if (!is_string($class) || $class === '') {
                $errors[] = 'entrypoint.class must be a non-empty string.';
            } elseif (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $class)) {
                $errors[] = 'entrypoint.class must be a valid PHP class name (short name only).';
            }
        }

        $requires = $manifest['requires'] ?? null;
        if (!is_array($requires)) {
            $errors[] = 'requires must be an object with at least an `auditix` constraint.';
        } else {
            if (!isset($requires['auditix']) || !is_string($requires['auditix']) || trim($requires['auditix']) === '') {
                $errors[] = 'requires.auditix must be a non-empty version constraint (e.g. ">=5.0.0,<6.0.0").';
            }
            if (isset($requires['php']) && (!is_string($requires['php']) || trim($requires['php']) === '')) {
                $errors[] = 'requires.php, when set, must be a non-empty string.';
            }
        }

        foreach (['description', 'author', 'homepage', 'license', 'icon'] as $optString) {
            if (isset($manifest[$optString]) && !is_string($manifest[$optString])) {
                $errors[] = sprintf('%s, when set, must be a string.', $optString);
            }
        }

        if (isset($manifest['capabilities'])) {
            if (!is_array($manifest['capabilities'])) {
                $errors[] = 'capabilities, when set, must be a list of strings.';
            } else {
                foreach ($manifest['capabilities'] as $cap) {
                    if (!is_string($cap)) {
                        $errors[] = 'capabilities entries must all be strings.';
                        break;
                    }
                }
            }
        }

        if (isset($manifest['manufacturers'])) {
            if (!is_array($manifest['manufacturers'])) {
                $errors[] = 'manufacturers, when set, must be a list of strings.';
            } else {
                foreach ($manifest['manufacturers'] as $m) {
                    if (!is_string($m)) {
                        $errors[] = 'manufacturers entries must all be strings.';
                        break;
                    }
                }
            }
        }

        if (isset($manifest['signature'])) {
            if (!is_array($manifest['signature'])) {
                $errors[] = 'signature, when set, must be an object.';
            } else {
                $sig = $manifest['signature'];
                if (!isset($sig['key_id']) || !is_string($sig['key_id'])) {
                    $errors[] = 'signature.key_id must be a string when signature is set.';
                }
                if (!isset($sig['algorithm']) || $sig['algorithm'] !== 'ed25519') {
                    $errors[] = 'signature.algorithm must be "ed25519" (the only supported algorithm).';
                }
            }
        }

        return [
            'valid' => $errors === [],
            'manifest' => $manifest,
            'errors' => $errors,
        ];
    }

    /**
     * @param string[] $errors
     * @return array{valid: bool, manifest: array<string,mixed>, errors: string[]}
     */
    private function fail(array $errors): array
    {
        return ['valid' => false, 'manifest' => [], 'errors' => $errors];
    }
}

<?php

namespace App\Service;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

class SecretEncryptionService
{
    private readonly string $key;

    public function __construct(
        #[Autowire('%kernel.secret%')]
        string $appSecret,
    ) {
        $this->key = sodium_crypto_generichash($appSecret . '|oidc-secret', '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    }

    public function encrypt(string $plaintext): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($plaintext, $nonce, $this->key);
        return base64_encode($nonce . $ciphertext);
    }

    public function decrypt(string $encrypted): ?string
    {
        $decoded = base64_decode($encrypted, true);
        if ($decoded === false || strlen($decoded) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES) {
            return null;
        }
        $nonce = substr($decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $this->key);
        return $plaintext === false ? null : $plaintext;
    }
}

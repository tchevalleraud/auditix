<?php

namespace App\Service;

use App\Entity\User;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class TotpService
{
    private const ISSUER = 'Auditix';
    private const CHALLENGE_TTL_SECONDS = 300;
    private const BACKUP_CODE_COUNT = 10;
    private const BACKUP_CODE_BYTES = 5;
    private const WINDOW = 1;

    private readonly Google2FA $google2fa;

    public function __construct(
        #[Autowire('%kernel.secret%')]
        private readonly string $appSecret,
    ) {
        $this->google2fa = new Google2FA();
    }

    public function generateSecret(): string
    {
        return $this->google2fa->generateSecretKey(32);
    }

    public function buildOtpAuthUri(User $user, string $secret): string
    {
        return $this->google2fa->getQRCodeUrl(
            self::ISSUER,
            $user->getUserIdentifier(),
            $secret,
        );
    }

    public function verifyCode(string $secret, string $code): bool
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (!preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        return (bool) $this->google2fa->verifyKey($secret, $code, self::WINDOW);
    }

    /**
     * @return array{plaintext: list<string>, hashed: list<string>}
     */
    public function generateBackupCodes(): array
    {
        $plaintext = [];
        $hashed = [];
        for ($i = 0; $i < self::BACKUP_CODE_COUNT; $i++) {
            $raw = strtolower(bin2hex(random_bytes(self::BACKUP_CODE_BYTES)));
            $code = substr($raw, 0, 5) . '-' . substr($raw, 5, 5);
            $plaintext[] = $code;
            $hashed[] = $this->hashBackupCode($code);
        }
        return ['plaintext' => $plaintext, 'hashed' => $hashed];
    }

    public function hashBackupCode(string $code): string
    {
        $normalized = strtolower(preg_replace('/[\s-]+/', '', $code) ?? '');
        return hash_hmac('sha256', $normalized, $this->appSecret);
    }

    /**
     * Try to consume a backup code; returns the new list (without the consumed entry) or null if invalid.
     *
     * @param list<string> $stored
     * @return list<string>|null
     */
    public function consumeBackupCode(array $stored, string $code): ?array
    {
        $hashed = $this->hashBackupCode($code);
        $idx = array_search($hashed, $stored, true);
        if ($idx === false) {
            return null;
        }
        $remaining = $stored;
        array_splice($remaining, (int) $idx, 1);
        return array_values($remaining);
    }

    public function issueChallenge(User $user): string
    {
        $payload = [
            'uid' => $user->getId(),
            'exp' => time() + self::CHALLENGE_TTL_SECONDS,
            'nonce' => bin2hex(random_bytes(8)),
        ];
        $body = $this->base64UrlEncode((string) json_encode($payload));
        $sig = $this->base64UrlEncode(hash_hmac('sha256', $body, $this->appSecret . '|totp-challenge', true));
        return $body . '.' . $sig;
    }

    /**
     * @return array{uid: int}|null
     */
    public function verifyChallenge(string $challenge): ?array
    {
        $parts = explode('.', $challenge);
        if (count($parts) !== 2) {
            return null;
        }
        [$body, $sig] = $parts;
        $expected = $this->base64UrlEncode(hash_hmac('sha256', $body, $this->appSecret . '|totp-challenge', true));
        if (!hash_equals($expected, $sig)) {
            return null;
        }
        $decoded = json_decode((string) $this->base64UrlDecode($body), true);
        if (!is_array($decoded) || !isset($decoded['uid'], $decoded['exp'])) {
            return null;
        }
        if ((int) $decoded['exp'] < time()) {
            return null;
        }
        return ['uid' => (int) $decoded['uid']];
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        $pad = strlen($data) % 4;
        if ($pad > 0) {
            $data .= str_repeat('=', 4 - $pad);
        }
        return (string) base64_decode(strtr($data, '-_', '+/'), true);
    }
}

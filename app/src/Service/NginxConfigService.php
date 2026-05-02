<?php

namespace App\Service;

use App\Entity\NginxConfig;
use App\Repository\NginxConfigRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class NginxConfigService
{
    private const CONFIG_DIR = '/var/nginx-config';
    private const CERTS_DIR = '/var/nginx-certs';
    private const DOCKER_SOCKET = '/var/run/docker.sock';

    private readonly string $secretKey;

    public function __construct(
        private readonly NginxConfigRepository $repository,
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.secret%')]
        string $appSecret,
        #[Autowire('%env(DOCKER_COMPOSE_PROJECT)%')]
        private readonly string $dockerProject = 'auditix',
    ) {
        $this->secretKey = sodium_crypto_generichash($appSecret . '|nginx-tls', '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    }

    public function get(): NginxConfig
    {
        return $this->repository->getSingleton();
    }

    public function saveSettings(NginxConfig $config): void
    {
        $config->touch();
        $this->em->flush();
    }

    /**
     * Validate, parse metadata, encrypt and store certificate material.
     * Throws \RuntimeException with a translatable code on invalid input.
     */
    public function setCertificate(NginxConfig $config, string $certificatePem, string $privateKeyPem, ?string $chainPem): void
    {
        $certificatePem = $this->normalizePem($certificatePem);
        $privateKeyPem = $this->normalizePem($privateKeyPem);
        $chainPem = $chainPem !== null ? $this->normalizePem($chainPem) : null;

        $cert = @openssl_x509_read($certificatePem);
        if ($cert === false) {
            throw new \RuntimeException('invalid_certificate');
        }
        $key = @openssl_pkey_get_private($privateKeyPem);
        if ($key === false) {
            throw new \RuntimeException('invalid_private_key');
        }
        if (!openssl_x509_check_private_key($cert, $key)) {
            throw new \RuntimeException('certificate_key_mismatch');
        }
        if ($chainPem !== null && $chainPem !== '') {
            $chainCount = preg_match_all('/-----BEGIN CERTIFICATE-----/', $chainPem);
            if ($chainCount === 0) {
                throw new \RuntimeException('invalid_chain');
            }
        }

        $info = $this->parseCertificateInfo($certificatePem);

        $config->setCertificateEncrypted($this->encrypt($certificatePem));
        $config->setPrivateKeyEncrypted($this->encrypt($privateKeyPem));
        $config->setCertificateChainEncrypted($chainPem !== null && $chainPem !== '' ? $this->encrypt($chainPem) : null);
        $config->setCertificateInfo($info);
        $config->touch();
        $this->em->flush();
    }

    public function clearCertificate(NginxConfig $config): void
    {
        $config->setCertificateEncrypted(null);
        $config->setPrivateKeyEncrypted(null);
        $config->setCertificateChainEncrypted(null);
        $config->setCertificateInfo(null);
        if ($config->getMode() !== NginxConfig::MODE_HTTP) {
            $config->setMode(NginxConfig::MODE_HTTP);
        }
        $config->touch();
        $this->em->flush();
    }

    /**
     * Render nginx conf, materialize files on disk, signal nginx to reload.
     * Returns ['reloaded' => bool, 'message' => string|null]
     */
    public function apply(NginxConfig $config): array
    {
        $needsCert = in_array($config->getMode(), [NginxConfig::MODE_HTTPS, NginxConfig::MODE_HTTP_HTTPS], true);
        if ($needsCert && !$config->hasCertificate()) {
            throw new \RuntimeException('certificate_required');
        }

        $this->ensureDirectories();

        if ($config->hasCertificate()) {
            $cert = $this->decrypt((string) $config->getCertificateEncrypted());
            $key = $this->decrypt((string) $config->getPrivateKeyEncrypted());
            $chain = $config->getCertificateChainEncrypted() !== null
                ? $this->decrypt((string) $config->getCertificateChainEncrypted())
                : null;

            if ($cert === null || $key === null) {
                throw new \RuntimeException('decryption_failed');
            }

            $fullChainPem = rtrim($cert) . "\n";
            if ($chain !== null && $chain !== '') {
                $fullChainPem .= rtrim($chain) . "\n";
            }

            $this->writeAtomic(self::CERTS_DIR . '/server.crt', $fullChainPem, 0640);
            $this->writeAtomic(self::CERTS_DIR . '/server.key', $key, 0600);
        } else {
            @unlink(self::CERTS_DIR . '/server.crt');
            @unlink(self::CERTS_DIR . '/server.key');
        }

        $conf = $this->renderConf($config);
        $this->writeAtomic(self::CONFIG_DIR . '/default.conf', $conf, 0644);

        $reload = $this->reloadNginx();

        $config->setAppliedAt(new \DateTimeImmutable());
        $this->em->flush();

        return $reload;
    }

    public function renderConf(NginxConfig $config): string
    {
        $serverName = $this->escapeNginxString($config->getServerName());
        $mode = $config->getMode();

        $upstreams = <<<NGINX
upstream phpfpm {
    server php:9000;
}

NGINX;

        // Resolve `node` and `mercure` via Docker's embedded DNS (127.0.0.11) at
        // request time, so a container restart that gets a new IP doesn't break
        // proxying until nginx is reloaded. Static `upstream` blocks cache the
        // first resolution forever; using a variable in `proxy_pass` opts into
        // resolver-driven re-resolution every `valid=...` seconds.
        $appLocations = <<<'NGINX'
    resolver 127.0.0.11 valid=10s ipv6=off;

    client_max_body_size 50M;

    access_log /var/log/nginx/access.real.log;
    error_log /var/log/nginx/error.real.log;

    error_page 502 /502.html;
    location = /502.html {
        root /etc/nginx/html;
        internal;
    }

    location /api {
        root /var/www/public;
        try_files $uri /index.php$is_args$args;
    }

    location ~ ^/index\.php(/|$) {
        root /var/www/public;
        fastcgi_pass phpfpm;
        fastcgi_split_path_info ^(.+\.php)(/.*)$;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/public$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT /var/www/public;
        internal;
    }

    location ~ \.php$ {
        return 404;
    }

    location /.well-known/mercure {
        # Use host:port without path so nginx forwards the original URI + query string
        set $upstream_mercure mercure:80;
        proxy_pass http://$upstream_mercure;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 24h;
    }

    location / {
        set $upstream_node node:3000;
        proxy_pass http://$upstream_node;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/webpack-hmr {
        set $upstream_node_hmr node:3000;
        proxy_pass http://$upstream_node_hmr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
NGINX;

        $tlsBlock = <<<NGINX
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

NGINX;

        $servers = '';

        if ($mode === NginxConfig::MODE_HTTP) {
            $servers = <<<NGINX
server {
    listen 80;
    server_name {$serverName};

{$appLocations}
}
NGINX;
            // If a certificate is still on disk, keep an HTTPS listener that
            // explicitly clears any cached HSTS header (max-age=0) and redirects
            // back to HTTP. Browsers that still try HTTPS first (cached redirect
            // or HSTS) will hit this and unstick themselves without manual cache
            // clearing.
            if ($config->hasCertificate()) {
                $servers .= "\n\n" . <<<NGINX
server {
    listen 443 ssl;
    http2 on;
    server_name {$serverName};

{$tlsBlock}
    add_header Strict-Transport-Security "max-age=0" always;
    return 301 http://\$host\$request_uri;
}
NGINX;
            }
        } elseif ($mode === NginxConfig::MODE_HTTPS) {
            $servers = <<<NGINX
server {
    listen 443 ssl;
    http2 on;
    server_name {$serverName};

{$tlsBlock}
{$appLocations}
}

server {
    listen 80;
    server_name {$serverName};
    return 444;
}
NGINX;
        } elseif ($mode === NginxConfig::MODE_HTTP_HTTPS) {
            $servers = <<<NGINX
server {
    listen 80;
    server_name {$serverName};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name {$serverName};

{$tlsBlock}
{$appLocations}
}
NGINX;
        }

        return $upstreams . "\n" . $servers . "\n";
    }

    public function parseCertificateInfo(string $pem): array
    {
        $parsed = @openssl_x509_parse($pem);
        if (!is_array($parsed)) {
            return [];
        }

        $subject = $this->formatDn($parsed['subject'] ?? []);
        $issuer = $this->formatDn($parsed['issuer'] ?? []);

        $san = [];
        if (!empty($parsed['extensions']['subjectAltName'])) {
            $san = array_map('trim', explode(',', (string) $parsed['extensions']['subjectAltName']));
        }

        $fingerprint = @openssl_x509_fingerprint($pem, 'sha256');

        return [
            'subject' => $subject,
            'issuer' => $issuer,
            'commonName' => $parsed['subject']['CN'] ?? null,
            'subjectAltNames' => $san,
            'validFrom' => isset($parsed['validFrom_time_t']) ? gmdate(\DateTimeInterface::ATOM, (int) $parsed['validFrom_time_t']) : null,
            'validTo' => isset($parsed['validTo_time_t']) ? gmdate(\DateTimeInterface::ATOM, (int) $parsed['validTo_time_t']) : null,
            'serialNumber' => $parsed['serialNumberHex'] ?? ($parsed['serialNumber'] ?? null),
            'fingerprintSha256' => $fingerprint !== false ? $fingerprint : null,
            'selfSigned' => $subject === $issuer,
        ];
    }

    private function formatDn(array $parts): string
    {
        $segments = [];
        foreach ($parts as $key => $value) {
            if (is_array($value)) {
                $value = implode(', ', $value);
            }
            $segments[] = "{$key}={$value}";
        }
        return implode(', ', $segments);
    }

    private function ensureDirectories(): void
    {
        foreach ([self::CONFIG_DIR, self::CERTS_DIR] as $dir) {
            if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
                throw new \RuntimeException("nginx_directory_unavailable:{$dir}");
            }
            if (!is_writable($dir)) {
                throw new \RuntimeException("nginx_directory_not_writable:{$dir}");
            }
        }
    }

    private function writeAtomic(string $path, string $content, int $mode): void
    {
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $content) === false) {
            throw new \RuntimeException('write_failed:' . $path);
        }
        @chmod($tmp, $mode);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            throw new \RuntimeException('rename_failed:' . $path);
        }
    }

    /**
     * @return array{reloaded: bool, message: ?string}
     */
    private function reloadNginx(): array
    {
        if (!file_exists(self::DOCKER_SOCKET)) {
            return ['reloaded' => false, 'message' => 'docker_socket_unavailable'];
        }

        $containerId = $this->findNginxContainerId();
        if ($containerId === null) {
            return ['reloaded' => false, 'message' => 'nginx_container_not_found'];
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => self::DOCKER_SOCKET,
            CURLOPT_URL => 'http://localhost/containers/' . $containerId . '/kill?signal=HUP',
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 204) {
            return ['reloaded' => false, 'message' => 'reload_failed:http_' . $httpCode . ':' . (is_string($response) ? substr($response, 0, 200) : '')];
        }

        return ['reloaded' => true, 'message' => null];
    }

    private function findNginxContainerId(): ?string
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => self::DOCKER_SOCKET,
            CURLOPT_URL => 'http://localhost/containers/json?filters=' . urlencode(json_encode([
                'label' => [
                    'com.docker.compose.project=' . $this->dockerProject,
                    'com.docker.compose.service=nginx',
                ],
            ])),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !is_string($response)) {
            return null;
        }
        $data = json_decode($response, true);
        if (!is_array($data) || empty($data)) {
            return null;
        }
        return $data[0]['Id'] ?? null;
    }

    private function normalizePem(string $pem): string
    {
        $pem = str_replace(["\r\n", "\r"], "\n", $pem);
        return trim($pem) . "\n";
    }

    private function escapeNginxString(string $value): string
    {
        return preg_replace('/[^A-Za-z0-9._\-*]/', '', $value) ?: 'localhost';
    }

    private function encrypt(string $plaintext): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($plaintext, $nonce, $this->secretKey);
        return base64_encode($nonce . $ciphertext);
    }

    private function decrypt(string $encrypted): ?string
    {
        $decoded = base64_decode($encrypted, true);
        if ($decoded === false || strlen($decoded) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES) {
            return null;
        }
        $nonce = substr($decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $this->secretKey);
        return $plaintext === false ? null : $plaintext;
    }
}

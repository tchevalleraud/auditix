<?php

namespace App\Service;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

class RabbitMqManagementClient
{
    private readonly string $host;
    private readonly string $user;
    private readonly string $password;
    private readonly string $vhost;
    private readonly int $port;

    public function __construct(
        #[Autowire('%env(MESSENGER_TRANSPORT_DSN)%')]
        string $dsn,
    ) {
        if (!preg_match('#^amqp://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^/]+)#', $dsn, $m)) {
            $this->user = 'auditix';
            $this->password = 'auditix';
            $this->host = 'rabbitmq';
            $this->vhost = '%2f';
            $this->port = 15672;
            return;
        }
        $this->user = urldecode($m[1]);
        $this->password = urldecode($m[2]);
        $this->host = $m[3];
        $this->vhost = $m[5];
        $this->port = 15672;
    }

    /**
     * @return array{ready: int, unacked: int, total: int, consumers: int}|null
     */
    public function getQueueStats(string $queue): ?array
    {
        $url = sprintf('http://%s:%d/api/queues/%s/%s', $this->host, $this->port, $this->vhost, rawurlencode($queue));
        $data = $this->request($url);
        if (!is_array($data)) {
            return null;
        }
        return [
            'ready' => (int) ($data['messages_ready'] ?? 0),
            'unacked' => (int) ($data['messages_unacknowledged'] ?? 0),
            'total' => (int) ($data['messages'] ?? 0),
            'consumers' => (int) ($data['consumers'] ?? 0),
        ];
    }

    private function request(string $url): mixed
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_USERPWD => $this->user . ':' . $this->password,
            CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        ]);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !is_string($response)) {
            return null;
        }
        return json_decode($response, true);
    }
}

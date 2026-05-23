<?php

namespace App\Service;

use App\Entity\LlmProvider;
use App\Repository\LlmProviderRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class LlmProviderService
{
    private readonly string $key;

    public function __construct(
        private readonly LlmProviderRepository $repository,
        private readonly EntityManagerInterface $em,
        private readonly HttpClientInterface $httpClient,
        #[Autowire('%kernel.secret%')]
        string $appSecret,
    ) {
        $this->key = sodium_crypto_generichash($appSecret . '|llm-provider-key', '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    }

    /** @return list<LlmProvider> */
    public function listAll(): array
    {
        return $this->repository->findAllOrdered();
    }

    /** @return list<LlmProvider> */
    public function listEnabled(): array
    {
        return $this->repository->findEnabled();
    }

    public function findById(int $id): ?LlmProvider
    {
        return $this->repository->find($id);
    }

    public function save(LlmProvider $provider): void
    {
        $provider->touch();
        if ($provider->getId() === null) {
            $this->em->persist($provider);
        }
        $this->em->flush();
    }

    public function delete(LlmProvider $provider): void
    {
        $this->em->remove($provider);
        $this->em->flush();
    }

    public function setApiKey(LlmProvider $provider, ?string $plaintext): void
    {
        if ($plaintext === null || $plaintext === '') {
            $provider->setApiKeyEncrypted(null);
        } else {
            $provider->setApiKeyEncrypted($this->encrypt($plaintext));
        }
        $provider->touch();
        $this->em->flush();
    }

    public function getDecryptedApiKey(LlmProvider $provider): ?string
    {
        $encrypted = $provider->getApiKeyEncrypted();
        if ($encrypted === null || $encrypted === '') {
            return null;
        }
        return $this->decrypt($encrypted);
    }

    /**
     * List models available on this provider. The shape returned by upstream
     * APIs differs between vendors so we normalize each entry to:
     *
     *   id: string                  — the canonical model id used in chat calls
     *   name: string                — human-friendly label
     *   contextLength: ?int         — max context window in tokens (when known)
     *   pricing: ?array{
     *     prompt: float,            — USD per *input* token (not per-1k/1M)
     *     completion: float,        — USD per *output* token
     *   }
     *   isFree: bool                — true when pricing is published as zero
     *   description: ?string        — short description if the upstream provides one
     *   meta: ?array<string,string> — provider-specific tags (e.g. ollama family/quant)
     *
     * Pricing-less providers (Ollama, OpenAI/Anthropic /v1/models) leave the
     * pricing fields null. OpenRouter publishes them, so we surface them as-is
     * for the UI to format.
     */
    public function listModels(LlmProvider $provider): array
    {
        $type = $provider->getType();
        $base = $provider->getBaseUrl();
        if ($base === '') {
            return [];
        }
        $key = $this->getDecryptedApiKey($provider);
        $headers = [];
        if ($key !== null && $key !== '') {
            if ($type === LlmProvider::TYPE_ANTHROPIC) {
                $headers['x-api-key'] = $key;
                $headers['anthropic-version'] = '2023-06-01';
            } else {
                $headers['Authorization'] = 'Bearer ' . $key;
            }
        }

        $endpoint = match ($type) {
            LlmProvider::TYPE_OLLAMA => $base . '/api/tags',
            default => $base . '/v1/models',
        };

        $response = $this->httpClient->request('GET', $endpoint, [
            'headers' => $headers,
            'timeout' => 15,
        ]);
        $status = $response->getStatusCode();
        if ($status >= 400) {
            throw new \RuntimeException(sprintf('Upstream returned HTTP %d', $status));
        }
        $payload = json_decode($response->getContent(false), true) ?? [];

        if ($type === LlmProvider::TYPE_OLLAMA) {
            $items = $payload['models'] ?? [];
            $out = [];
            foreach ($items as $m) {
                $name = (string) ($m['name'] ?? $m['model'] ?? '');
                if ($name === '') continue;
                $details = is_array($m['details'] ?? null) ? $m['details'] : [];
                $sizeBytes = isset($m['size']) ? (int) $m['size'] : null;
                $meta = [];
                if (!empty($details['family'])) $meta['family'] = (string) $details['family'];
                if (!empty($details['parameter_size'])) $meta['parameters'] = (string) $details['parameter_size'];
                if (!empty($details['quantization_level'])) $meta['quantization'] = (string) $details['quantization_level'];
                if ($sizeBytes) $meta['fileSize'] = $this->formatBytes($sizeBytes);
                $out[] = [
                    'id' => $name,
                    'name' => $name,
                    'contextLength' => null,
                    'pricing' => null,
                    'isFree' => true, // self-hosted Ollama has no per-token cost
                    // Ollama's /api/tags doesn't expose tool support; we leave
                    // it unknown so the UI doesn't make a wrong promise.
                    'supportsTools' => null,
                    'description' => null,
                    'meta' => $meta,
                ];
            }
            return $out;
        }

        // OpenAI-compatible payload. OpenRouter extends it with pricing and
        // context_length fields; OpenAI/Anthropic /v1/models do not.
        $items = $payload['data'] ?? [];
        $out = [];
        foreach ($items as $m) {
            $id = (string) ($m['id'] ?? '');
            if ($id === '') continue;
            $displayName = (string) ($m['name'] ?? $id);
            $contextLength = isset($m['context_length']) ? (int) $m['context_length']
                : (isset($m['top_provider']['context_length']) ? (int) $m['top_provider']['context_length'] : null);

            // OpenRouter pricing is per-token already (in USD strings).
            $pricing = null;
            $isFree = false;
            if (isset($m['pricing']) && is_array($m['pricing'])) {
                $prompt = isset($m['pricing']['prompt']) ? (float) $m['pricing']['prompt'] : null;
                $completion = isset($m['pricing']['completion']) ? (float) $m['pricing']['completion'] : null;
                if ($prompt !== null || $completion !== null) {
                    $pricing = [
                        'prompt' => $prompt ?? 0.0,
                        'completion' => $completion ?? 0.0,
                    ];
                    $isFree = ($pricing['prompt'] <= 0.0) && ($pricing['completion'] <= 0.0);
                }
            }
            // OpenRouter's convention: model ids ending in ":free" are gratis.
            if (!$isFree && str_ends_with(strtolower($id), ':free')) {
                $isFree = true;
            }

            $description = isset($m['description']) ? (string) $m['description'] : null;

            // Tool-calling support. OpenRouter publishes a `supported_parameters`
            // array per model containing tokens like "tools" or "tool_choice";
            // OpenAI's /v1/models doesn't expose this, so we default to true
            // there (all current OpenAI chat models support tools — picking
            // a model that doesn't will fail at chat time with a clear 4xx).
            $supportsTools = null;
            if (isset($m['supported_parameters']) && is_array($m['supported_parameters'])) {
                $params = array_map('strtolower', array_map('strval', $m['supported_parameters']));
                $supportsTools = in_array('tools', $params, true) || in_array('tool_choice', $params, true);
            } elseif ($type === LlmProvider::TYPE_OPENAI) {
                $supportsTools = true;
            }

            $out[] = [
                'id' => $id,
                'name' => $displayName !== '' ? $displayName : $id,
                'contextLength' => $contextLength ?: null,
                'pricing' => $pricing,
                'isFree' => $isFree,
                'supportsTools' => $supportsTools,
                'description' => $description,
                'meta' => null,
            ];
        }
        return $out;
    }

    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $v = (float) $bytes;
        while ($v >= 1024 && $i < count($units) - 1) {
            $v /= 1024;
            $i++;
        }
        return sprintf('%.1f %s', $v, $units[$i]);
    }

    /**
     * Send a chat completion request to the configured provider.
     *
     * $messages is a list of OpenAI-style messages. Each entry can be a plain
     * {role,content} pair, or carry tool-calling artefacts via the optional
     * `tool_calls` / `tool_call_id` keys (passed through verbatim for
     * OpenAI-compatible providers).
     *
     * When $tools is provided AND the provider is OpenAI-compatible, the
     * tools array is included in the request so the model can call them.
     * The return shape is augmented with `toolCalls` whenever the model
     * decided to call instead of replying directly — callers run the tools
     * and re-invoke `chat()` with the appended tool result messages.
     *
     * Anthropic and Ollama-native protocols do not currently receive the
     * tools array (they speak different tool dialects). The caller should
     * gate tool-aware behaviour on `supportsOpenAiTools()`.
     *
     * @param array<int, array<string, mixed>> $messages
     * @param list<array{type: string, function: array}>|null $tools
     * @return array{content: string, toolCalls: list<array{id: string, name: string, arguments: array}>, raw: array<string, mixed>}
     */
    public function chat(LlmProvider $provider, string $model, array $messages, ?string $systemPrompt = null, ?array $tools = null): array
    {
        $type = $provider->getType();
        $base = $provider->getBaseUrl();
        $key = $this->getDecryptedApiKey($provider);

        $headers = ['Content-Type' => 'application/json'];
        if ($key !== null && $key !== '') {
            if ($type === LlmProvider::TYPE_ANTHROPIC) {
                $headers['x-api-key'] = $key;
                $headers['anthropic-version'] = '2023-06-01';
            } else {
                $headers['Authorization'] = 'Bearer ' . $key;
            }
        }

        if ($type === LlmProvider::TYPE_ANTHROPIC) {
            $body = [
                'model' => $model,
                'max_tokens' => 4096,
                'messages' => array_values(array_filter(
                    array_map(
                        fn(array $m) => ['role' => $m['role'], 'content' => $m['content']],
                        $messages
                    ),
                    fn(array $m) => in_array($m['role'], ['user', 'assistant'], true)
                )),
            ];
            if ($systemPrompt !== null && $systemPrompt !== '') {
                $body['system'] = $systemPrompt;
            }
            $endpoint = $base . '/v1/messages';
            $response = $this->httpClient->request('POST', $endpoint, [
                'headers' => $headers,
                'json' => $body,
                'timeout' => 120,
            ]);
            $status = $response->getStatusCode();
            $payload = json_decode($response->getContent(false), true) ?? [];
            if ($status >= 400) {
                $msg = $payload['error']['message'] ?? sprintf('Upstream returned HTTP %d', $status);
                throw new \RuntimeException((string) $msg);
            }
            $blocks = $payload['content'] ?? [];
            $text = '';
            foreach ($blocks as $b) {
                if (($b['type'] ?? '') === 'text') {
                    $text .= (string) ($b['text'] ?? '');
                }
            }
            return ['content' => $text, 'toolCalls' => [], 'raw' => $payload];
        }

        if ($type === LlmProvider::TYPE_OLLAMA) {
            // Ollama supports the OpenAI-compatible /v1/chat/completions endpoint
            // but also a native /api/chat. We use the native one which doesn't
            // require an API key.
            $msgs = $messages;
            if ($systemPrompt !== null && $systemPrompt !== '') {
                array_unshift($msgs, ['role' => 'system', 'content' => $systemPrompt]);
            }
            $endpoint = $base . '/api/chat';
            $response = $this->httpClient->request('POST', $endpoint, [
                'headers' => $headers,
                'json' => [
                    'model' => $model,
                    'messages' => $msgs,
                    'stream' => false,
                ],
                'timeout' => 120,
            ]);
            $status = $response->getStatusCode();
            $payload = json_decode($response->getContent(false), true) ?? [];
            if ($status >= 400) {
                $msg = $payload['error'] ?? sprintf('Upstream returned HTTP %d', $status);
                throw new \RuntimeException(is_string($msg) ? $msg : 'Ollama error');
            }
            $text = (string) ($payload['message']['content'] ?? '');
            return ['content' => $text, 'toolCalls' => [], 'raw' => $payload];
        }

        // OpenAI / OpenRouter / OpenAI-compatible
        $msgs = $messages;
        if ($systemPrompt !== null && $systemPrompt !== '') {
            array_unshift($msgs, ['role' => 'system', 'content' => $systemPrompt]);
        }
        $body = [
            'model' => $model,
            'messages' => $msgs,
        ];
        if ($tools !== null && !empty($tools)) {
            $body['tools'] = $tools;
            // Note: we deliberately do NOT send `tool_choice`. Some OpenRouter
            // routes (notably several free models) support `tools` but reject
            // `tool_choice` outright, returning "No endpoints found that
            // support the provided 'tool_choice' value". Omitting the field
            // makes the provider apply its default behaviour ("auto"), which
            // is what we want anyway.
        }
        $endpoint = $base . '/v1/chat/completions';
        $response = $this->httpClient->request('POST', $endpoint, [
            'headers' => $headers,
            'json' => $body,
            'timeout' => 120,
        ]);
        $status = $response->getStatusCode();
        $payload = json_decode($response->getContent(false), true) ?? [];
        if ($status >= 400) {
            $msg = $payload['error']['message'] ?? sprintf('Upstream returned HTTP %d', $status);
            throw new \RuntimeException((string) $msg);
        }
        $msg = $payload['choices'][0]['message'] ?? [];
        $text = (string) ($msg['content'] ?? '');
        $toolCalls = [];
        foreach (($msg['tool_calls'] ?? []) as $tc) {
            $rawArgs = $tc['function']['arguments'] ?? '{}';
            $decoded = is_string($rawArgs) ? (json_decode($rawArgs, true) ?? []) : (is_array($rawArgs) ? $rawArgs : []);
            $toolCalls[] = [
                'id' => (string) ($tc['id'] ?? ''),
                'name' => (string) ($tc['function']['name'] ?? ''),
                'arguments' => $decoded,
                // Raw form preserved so we can echo it back exactly when
                // appending the assistant message to the next turn.
                'raw' => $tc,
            ];
        }
        return ['content' => $text, 'toolCalls' => $toolCalls, 'raw' => $payload];
    }

    /**
     * Whether this provider speaks the OpenAI-compatible tool-calling dialect.
     * Anthropic and Ollama-native have their own shapes — those would need
     * separate adapters before we can hand them tools. Returning false from
     * here makes the caller skip the tools array entirely.
     */
    public function supportsOpenAiTools(LlmProvider $provider): bool
    {
        return in_array(
            $provider->getType(),
            [LlmProvider::TYPE_OPENROUTER, LlmProvider::TYPE_OPENAI],
            true,
        );
    }

    private function encrypt(string $plaintext): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($plaintext, $nonce, $this->key);
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
        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $this->key);
        return $plaintext === false ? null : $plaintext;
    }

    public static function defaultBaseUrlForType(string $type): string
    {
        return match ($type) {
            LlmProvider::TYPE_OPENROUTER => 'https://openrouter.ai/api',
            LlmProvider::TYPE_OLLAMA => 'http://localhost:11434',
            LlmProvider::TYPE_OPENAI => 'https://api.openai.com',
            LlmProvider::TYPE_ANTHROPIC => 'https://api.anthropic.com',
            default => '',
        };
    }
}

<?php

namespace App\Controller\Api;

use App\Entity\AiAssistant;
use App\Entity\AiConversation;
use App\Entity\AiMessage;
use App\Entity\Context;
use App\Entity\User;
use App\Repository\AiAssistantRepository;
use App\Repository\AiConversationRepository;
use App\Repository\ContextRepository;
use App\Repository\LlmProviderRepository;
use App\Service\Ai\AiToolRegistry;
use App\Service\LlmProviderService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

class AiAssistantController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AiAssistantRepository $assistants,
        private readonly AiConversationRepository $conversations,
        private readonly ContextRepository $contexts,
        private readonly LlmProviderRepository $providers,
        private readonly LlmProviderService $llm,
        private readonly AiToolRegistry $tools,
    ) {
    }

    private function canAccessContext(Context $ctx): bool
    {
        if ($this->isGranted('ROLE_ADMIN')) return true;
        /** @var User $user */
        $user = $this->getUser();
        return $ctx->getUsers()->contains($user);
    }

    private function serializeAssistant(AiAssistant $a, bool $detailed = false): array
    {
        $out = [
            'id' => $a->getId(),
            'name' => $a->getName(),
            'contextId' => $a->getContext()?->getId(),
            'contextName' => $a->getContext()?->getName(),
            'providerId' => $a->getProvider()?->getId(),
            'providerName' => $a->getProvider()?->getName(),
            'providerType' => $a->getProvider()?->getType(),
            'model' => $a->getModel(),
            'effectiveModel' => $a->getEffectiveModel(),
            'enabled' => $a->isEnabled(),
            'toolsEnabled' => $a->isToolsEnabled(),
            'toolsSupported' => $a->getProvider() ? $this->llm->supportsOpenAiTools($a->getProvider()) : false,
            'updatedAt' => $a->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
        if ($detailed) {
            $out['systemPrompt'] = $a->getSystemPrompt();
        }
        return $out;
    }

    private function serializeConversation(AiConversation $c, bool $withMessages = false): array
    {
        $out = [
            'id' => $c->getId(),
            'title' => $c->getTitle(),
            'createdAt' => $c->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updatedAt' => $c->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            'assistantId' => $c->getAssistant()?->getId(),
            'autoApproveTools' => $c->isAutoApproveTools(),
        ];
        if ($withMessages) {
            $out['messages'] = array_map(
                fn(AiMessage $m) => [
                    'id' => $m->getId(),
                    'role' => $m->getRole(),
                    'content' => $m->getContent(),
                    'metadata' => $m->getMetadata(),
                    'createdAt' => $m->getCreatedAt()->format(\DateTimeInterface::ATOM),
                ],
                $c->getMessages()->toArray()
            );
        }
        return $out;
    }

    // ── Assistant CRUD (admin only) ──────────────────────────────────────

    #[Route('/api/contexts/{id}/ai-assistants', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function listForContext(int $id): JsonResponse
    {
        $ctx = $this->contexts->find($id);
        if ($ctx === null) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json(array_map(
            fn(AiAssistant $a) => $this->serializeAssistant($a, true),
            $this->assistants->findByContext($ctx)
        ));
    }

    #[Route('/api/contexts/{id}/ai-assistants', methods: ['POST'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function createForContext(int $id, Request $request): JsonResponse
    {
        $ctx = $this->contexts->find($id);
        if ($ctx === null) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $name = trim((string) ($data['name'] ?? ''));
        $providerId = (int) ($data['providerId'] ?? 0);
        if ($name === '' || $providerId <= 0) {
            return $this->json(['error' => 'name and providerId are required'], Response::HTTP_BAD_REQUEST);
        }
        $provider = $this->providers->find($providerId);
        if ($provider === null) {
            return $this->json(['error' => 'Unknown provider'], Response::HTTP_BAD_REQUEST);
        }

        $assistant = new AiAssistant();
        $assistant->setContext($ctx);
        $assistant->setName($name);
        $assistant->setProvider($provider);
        $this->applyAssistantData($assistant, $data);
        $this->em->persist($assistant);
        $this->em->flush();

        return $this->json($this->serializeAssistant($assistant, true), Response::HTTP_CREATED);
    }

    #[Route('/api/ai-assistants/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function getAssistant(int $id): JsonResponse
    {
        $a = $this->assistants->find($id);
        if ($a === null) return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        return $this->json($this->serializeAssistant($a, true));
    }

    #[Route('/api/ai-assistants/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function updateAssistant(int $id, Request $request): JsonResponse
    {
        $a = $this->assistants->find($id);
        if ($a === null) return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name !== '') $a->setName($name);
        }
        if (array_key_exists('providerId', $data)) {
            $provider = $this->providers->find((int) $data['providerId']);
            if ($provider === null) {
                return $this->json(['error' => 'Unknown provider'], Response::HTTP_BAD_REQUEST);
            }
            $a->setProvider($provider);
        }
        $this->applyAssistantData($a, $data);
        $a->touch();
        $this->em->flush();
        return $this->json($this->serializeAssistant($a, true));
    }

    #[Route('/api/ai-assistants/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_ADMIN')]
    public function deleteAssistant(int $id): JsonResponse
    {
        $a = $this->assistants->find($id);
        if ($a === null) return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        $this->em->remove($a);
        $this->em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function applyAssistantData(AiAssistant $a, array $data): void
    {
        if (array_key_exists('model', $data)) {
            $v = is_string($data['model']) ? trim($data['model']) : null;
            $a->setModel($v === '' ? null : $v);
        }
        if (array_key_exists('systemPrompt', $data)) {
            $v = is_string($data['systemPrompt']) ? $data['systemPrompt'] : null;
            $a->setSystemPrompt(($v === null || $v === '') ? null : $v);
        }
        if (array_key_exists('enabled', $data)) {
            $a->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('toolsEnabled', $data)) {
            $a->setToolsEnabled((bool) $data['toolsEnabled']);
        }
    }

    // ── Chat surface (any authenticated user) ────────────────────────────

    /**
     * Lists assistants the current user can chat with. Used by the Topbar
     * picker — admins see everything, regular users see assistants in the
     * contexts they belong to. The optional `?context=X` filter restricts
     * the result to a single context; the panel uses it so the picker only
     * shows assistants from whichever context the user has currently open.
     */
    #[Route('/api/ai/assistants', methods: ['GET'])]
    public function listReachable(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();
        $isAdmin = $this->isGranted('ROLE_ADMIN');
        $contextId = (int) $request->query->get('context', 0);
        $context = $contextId > 0 ? $this->contexts->find($contextId) : null;
        if ($contextId > 0 && ($context === null || !$this->canAccessContext($context))) {
            return $this->json([]);
        }
        $assistants = $this->assistants->findReachableByUser($user, $isAdmin, $context);
        return $this->json(array_map(fn(AiAssistant $a) => $this->serializeAssistant($a), $assistants));
    }

    private function resolveAssistant(int $id): ?AiAssistant
    {
        $a = $this->assistants->find($id);
        if ($a === null) return null;
        if (!$this->canAccessContext($a->getContext())) return null;
        return $a;
    }

    #[Route('/api/ai/conversations', methods: ['GET'])]
    public function listConversations(Request $request): JsonResponse
    {
        $assistantId = (int) $request->query->get('assistant', 0);
        if ($assistantId <= 0) {
            return $this->json(['error' => 'assistant query param required'], Response::HTTP_BAD_REQUEST);
        }
        $a = $this->resolveAssistant($assistantId);
        if ($a === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        /** @var User $user */
        $user = $this->getUser();
        $list = $this->conversations->findForUserAndAssistant($user, $a);
        return $this->json(array_map(fn(AiConversation $c) => $this->serializeConversation($c), $list));
    }

    #[Route('/api/ai/conversations/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getConversation(int $id): JsonResponse
    {
        $conv = $this->conversations->find($id);
        if ($conv === null || $conv->getUser() !== $this->getUser()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $out = $this->serializeConversation($conv, true);
        // Surface pending state directly on the conversation payload so the
        // UI can render the approval card when the user reopens a paused
        // discussion (rather than only on a fresh chat() call).
        $envelope = $this->buildChatResponse($conv);
        $out['pending'] = $envelope['pending'];
        return $this->json($out);
    }

    #[Route('/api/ai/conversations/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function deleteConversation(int $id): JsonResponse
    {
        $conv = $this->conversations->find($id);
        if ($conv === null || $conv->getUser() !== $this->getUser()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->em->remove($conv);
        $this->em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/api/ai/chat', methods: ['POST'])]
    public function chat(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $assistantId = (int) ($data['assistantId'] ?? 0);
        if ($assistantId <= 0) {
            return $this->json(['error' => 'assistantId is required'], Response::HTTP_BAD_REQUEST);
        }
        $a = $this->resolveAssistant($assistantId);
        if ($a === null) {
            return $this->json(['error' => 'Assistant not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$a->isEnabled()) {
            return $this->json(['error' => 'Assistant is disabled'], Response::HTTP_FAILED_DEPENDENCY);
        }
        $provider = $a->getProvider();
        if ($provider === null || !$provider->isEnabled()) {
            return $this->json(['error' => 'The configured AI provider is unavailable'], Response::HTTP_FAILED_DEPENDENCY);
        }
        $model = $a->getEffectiveModel();
        if (!$model) {
            return $this->json(['error' => 'No model selected for this assistant'], Response::HTTP_FAILED_DEPENDENCY);
        }

        $content = trim((string) ($data['content'] ?? ''));
        if ($content === '') {
            return $this->json(['error' => 'content is required'], Response::HTTP_BAD_REQUEST);
        }

        /** @var User $user */
        $user = $this->getUser();

        $conversation = null;
        $convId = $data['conversationId'] ?? null;
        if ($convId) {
            $conversation = $this->conversations->find((int) $convId);
            if ($conversation === null || $conversation->getUser() !== $user || $conversation->getAssistant() !== $a) {
                return $this->json(['error' => 'Conversation not found'], Response::HTTP_NOT_FOUND);
            }
        } else {
            $conversation = new AiConversation();
            $conversation->setUser($user);
            $conversation->setAssistant($a);
            $title = mb_substr($content, 0, 60);
            if (mb_strlen($content) > 60) $title .= '…';
            $conversation->setTitle($title);
            $this->em->persist($conversation);
        }

        $userMsg = new AiMessage();
        $userMsg->setConversation($conversation);
        $userMsg->setRole(AiMessage::ROLE_USER);
        $userMsg->setContent($content);
        $this->em->persist($userMsg);
        $conversation->addMessage($userMsg);
        $conversation->touch();
        $this->em->flush();

        try {
            $this->runLoop($conversation, $a, $provider, $model);
        } catch (\Throwable $e) {
            $conversation->touch();
            $this->em->flush();
            return $this->json(['error' => $e->getMessage(), 'conversationId' => $conversation->getId()], Response::HTTP_BAD_GATEWAY);
        }

        return $this->json($this->buildChatResponse($conversation));
    }

    /**
     * Resume a paused conversation. Triggered after the UI shows the user
     * the pending tool calls and they answer Approve or Reject. We expect
     * the *last* persisted message to be a tool_call with no matching tool
     * results yet — any other state is rejected (avoids double-runs).
     */
    #[Route('/api/ai/conversations/{id}/resume', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function resume(int $id, Request $request): JsonResponse
    {
        $conv = $this->conversations->find($id);
        if ($conv === null || $conv->getUser() !== $this->getUser()) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $assistant = $conv->getAssistant();
        $provider = $assistant?->getProvider();
        $model = $assistant?->getEffectiveModel();
        if ($assistant === null || $provider === null || $model === null) {
            return $this->json(['error' => 'Assistant or provider missing'], Response::HTTP_FAILED_DEPENDENCY);
        }

        $data = json_decode($request->getContent(), true);
        $action = is_array($data) ? (string) ($data['action'] ?? '') : '';
        if (!in_array($action, ['approve', 'reject'], true)) {
            return $this->json(['error' => 'action must be "approve" or "reject"'], Response::HTTP_BAD_REQUEST);
        }
        $autoApprove = is_array($data) ? (bool) ($data['autoApprove'] ?? false) : false;

        // Find the staged tool results (results already executed locally,
        // waiting to be sent to the LLM). Anything else is a 409.
        $pendingResults = $this->findStagedToolResults($conv);
        if (empty($pendingResults)) {
            return $this->json(['error' => 'No pending tool results to resume'], Response::HTTP_CONFLICT);
        }

        // Persist the auto-approve flag if the user opted in. From here on,
        // the loop runs to completion without further confirmation prompts
        // *for this conversation*. Other conversations remain gated.
        if ($autoApprove) {
            $conv->setAutoApproveTools(true);
        }

        if ($action === 'reject') {
            // The user has seen the data but doesn't want it transmitted.
            // Overwrite each staged tool result with a refusal payload —
            // the structured `role=tool` slot must stay so OpenAI's API
            // doesn't choke on an orphaned tool_call_id, but the content
            // becomes a stub that tells the model it has no information.
            foreach ($pendingResults as $tm) {
                $tm->setContent(json_encode(
                    ['error' => 'User refused to share this data with the LLM.'],
                    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
                ) ?: '{}');
                $meta = $tm->getMetadata() ?? [];
                $meta['refused'] = true;
                $tm->setMetadata($meta);
            }
            $conv->touch();
            $this->em->flush();
        }

        // Resume the loop — chat() is called with the (real or refusal)
        // results baked into the history. The model either replies or
        // chains another tool call (which will pause again).
        try {
            $this->runLoop($conv, $assistant, $provider, $model);
        } catch (\Throwable $e) {
            $conv->touch();
            $this->em->flush();
            return $this->json(['error' => $e->getMessage(), 'conversationId' => $conv->getId()], Response::HTTP_BAD_GATEWAY);
        }

        return $this->json($this->buildChatResponse($conv));
    }

    /**
     * Drives the LLM ↔ tool-execution loop. Stops when either:
     *  - the model replies without calling a tool (normal end),
     *  - tool results are ready and the conversation is not on auto-approve
     *    (return so the UI can show the user what would be sent),
     *  - the max iteration cap is hit (safety net).
     *
     * Why we execute *before* pausing: the whole point of the approval gate
     * is to let the user *see the data* that would be transmitted to the
     * LLM. Pausing on the call (without the result) only shows the tool
     * name + args, which doesn't answer "what is leaving my server".
     * Executing locally first is cheap (read-only DB queries already
     * anonymised), and the actual payload becomes visible.
     *
     * Persists everything as it goes so a crash mid-loop leaves a
     * consistent transcript.
     */
    private function runLoop(AiConversation $conv, AiAssistant $a, \App\Entity\LlmProvider $provider, string $model): void
    {
        $useTools = $a->isToolsEnabled() && $this->llm->supportsOpenAiTools($provider);
        $toolDefs = $useTools ? $this->tools->getOpenAiToolDefinitions() : null;
        $maxIterations = 6;

        for ($i = 0; $i < $maxIterations; $i++) {
            $history = $this->buildHistoryFromConversation($conv);
            $reply = $this->llm->chat($provider, $model, $history, $a->getSystemPrompt(), $toolDefs);
            $toolCalls = $reply['toolCalls'] ?? [];

            if (empty($toolCalls)) {
                $assistantMsg = new AiMessage();
                $assistantMsg->setConversation($conv);
                $assistantMsg->setRole(AiMessage::ROLE_ASSISTANT);
                $assistantMsg->setContent((string) ($reply['content'] ?? ''));
                $this->em->persist($assistantMsg);
                $conv->addMessage($assistantMsg);
                $conv->touch();
                $this->em->flush();
                return;
            }

            // Persist the tool_call message so the transcript carries the
            // structured request alongside the result.
            $callMsg = new AiMessage();
            $callMsg->setConversation($conv);
            $callMsg->setRole(AiMessage::ROLE_TOOL_CALL);
            $callMsg->setContent((string) ($reply['content'] ?? ''));
            $callMsg->setMetadata(['tool_calls' => array_map(
                fn(array $tc) => ['id' => $tc['id'], 'name' => $tc['name'], 'arguments' => $tc['arguments']],
                $toolCalls,
            )]);
            $this->em->persist($callMsg);
            $conv->addMessage($callMsg);

            // Execute every call locally — these are read-only and the
            // anonymiser strips identifying fields before the data could
            // ever leave the server.
            foreach ($toolCalls as $tc) {
                try {
                    $result = $this->tools->execute($tc['name'], $tc['arguments'], $conv);
                } catch (\Throwable $e) {
                    $result = ['error' => $e->getMessage()];
                }
                $resultJson = json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $toolMsg = new AiMessage();
                $toolMsg->setConversation($conv);
                $toolMsg->setRole(AiMessage::ROLE_TOOL);
                $toolMsg->setContent($resultJson === false ? '{}' : $resultJson);
                $toolMsg->setMetadata(['tool_call_id' => $tc['id'], 'name' => $tc['name']]);
                $this->em->persist($toolMsg);
                $conv->addMessage($toolMsg);
            }
            $conv->touch();
            $this->em->flush();

            // Human-in-the-loop: pause here, results staged but not yet
            // sent to the LLM. /resume will either continue the loop
            // (approve) or rewrite the staged results as refusal payloads
            // (reject) before continuing.
            if (!$conv->isAutoApproveTools()) {
                return;
            }
            // Auto-approve mode: fall through to the next iteration, which
            // sends the staged results back to the LLM.
        }
    }

    /**
     * Locate tool result messages that have been executed locally but not
     * yet sent to the LLM. The convention is straightforward: if the
     * conversation's tail consists of one or more `tool` messages preceded
     * by a `tool_call`, those tool messages are staged. Once the LLM is
     * re-called, the next message becomes `assistant` (or another
     * `tool_call`), and the previous tools settle into history.
     *
     * @return list<AiMessage>
     */
    private function findStagedToolResults(AiConversation $conv): array
    {
        $messages = $conv->getMessages()->toArray();
        $staged = [];
        $sawToolCall = false;
        foreach (array_reverse($messages) as $m) {
            $role = $m->getRole();
            if ($role === AiMessage::ROLE_TOOL) {
                array_unshift($staged, $m);
                continue;
            }
            if ($role === AiMessage::ROLE_TOOL_CALL) {
                $sawToolCall = true;
            }
            // Any non-tool message stops the walk: anything before is
            // settled history.
            break;
        }
        return $sawToolCall ? $staged : [];
    }

    /**
     * Build the JSON envelope returned by chat(), resume() and the
     * conversation GET. `pending` exposes both the original call arguments
     * AND the executed (anonymised) tool result content, so the UI's
     * approval card can show what would actually be sent to the LLM.
     */
    private function buildChatResponse(AiConversation $conv): array
    {
        $staged = $this->findStagedToolResults($conv);
        $out = [
            'conversationId' => $conv->getId(),
            'title' => $conv->getTitle(),
            'autoApproveTools' => $conv->isAutoApproveTools(),
            'pending' => null,
        ];
        if (empty($staged)) {
            return $out;
        }

        // Locate the originating tool_call (sits just before the first
        // staged tool result) to surface argument context to the user.
        $messages = $conv->getMessages()->toArray();
        $firstStagedId = $staged[0]->getId();
        $callMsg = null;
        foreach ($messages as $idx => $m) {
            if ($m->getId() === $firstStagedId && $idx > 0) {
                $callMsg = $messages[$idx - 1];
                break;
            }
        }
        $argsById = [];
        foreach (($callMsg?->getMetadata()['tool_calls'] ?? []) as $tc) {
            $argsById[(string) ($tc['id'] ?? '')] = $tc;
        }

        $out['pending'] = [
            'messageId' => $callMsg?->getId(),
            'results' => array_map(
                function (AiMessage $tm) use ($argsById) {
                    $tcid = (string) ($tm->getMetadata()['tool_call_id'] ?? '');
                    $call = $argsById[$tcid] ?? null;
                    return [
                        'toolCallId' => $tcid,
                        'name' => (string) ($tm->getMetadata()['name'] ?? ($call['name'] ?? '')),
                        'arguments' => $call['arguments'] ?? new \stdClass(),
                        'content' => $tm->getContent(),
                    ];
                },
                $staged,
            ),
        ];
        return $out;
    }

    /**
     * Rehydrate the OpenAI-style messages array from persisted records.
     * tool_call assistant turns become an assistant message with a
     * `tool_calls` field; tool result turns become role=tool with the
     * matching tool_call_id. Plain user/assistant/system roles pass through.
     */
    private function buildHistoryFromConversation(AiConversation $conv): array
    {
        $history = [];
        foreach ($conv->getMessages() as $m) {
            $role = $m->getRole();
            if ($role === AiMessage::ROLE_TOOL_CALL) {
                $calls = $m->getMetadata()['tool_calls'] ?? [];
                $history[] = [
                    'role' => 'assistant',
                    'content' => $m->getContent() ?: '',
                    'tool_calls' => array_map(
                        fn(array $c) => [
                            'id' => $c['id'],
                            'type' => 'function',
                            'function' => [
                                'name' => $c['name'],
                                'arguments' => json_encode($c['arguments'] ?? new \stdClass()),
                            ],
                        ],
                        $calls,
                    ),
                ];
                continue;
            }
            if ($role === AiMessage::ROLE_TOOL) {
                $history[] = [
                    'role' => 'tool',
                    'tool_call_id' => $m->getMetadata()['tool_call_id'] ?? '',
                    'content' => $m->getContent(),
                ];
                continue;
            }
            $history[] = ['role' => $role, 'content' => $m->getContent()];
        }
        return $history;
    }
}

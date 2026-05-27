<?php

namespace App\Service\Ai;

use App\Entity\AiConversation;
use App\Entity\ComplianceResult;
use App\Entity\Context;
use App\Repository\NodeRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Catalogue of read-only tools exposed to the LLM.
 *
 * Each tool is described in OpenAI function-calling JSON Schema so it can
 * be passed straight to OpenRouter / OpenAI. Tool *results* never auto-flow
 * to the LLM — the chat controller stages every payload and waits for an
 * explicit user approval (the human-in-the-loop gate). That gate is the
 * data-protection mechanism; the tools themselves return real Auditix data
 * so the model can reason precisely about it (hostnames, IPs, scores…).
 *
 * Why read-only: tool execution is driven by the model and runs without
 * confirmation per individual call. Allowing writes would let a
 * hallucinated argument mutate production state. If write tools become
 * desirable later, they should require a *separate* gate on top of the
 * existing one.
 */
class AiToolRegistry
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly NodeRepository $nodes,
        private readonly AiDataDescriber $describer,
    ) {
    }

    /**
     * Return the OpenAI-style tools array — pass this verbatim in the chat
     * request when the assistant has tools enabled.
     *
     * @return list<array{type: string, function: array}>
     */
    public function getOpenAiToolDefinitions(): array
    {
        return [
            [
                'type' => 'function',
                'function' => [
                    'name' => 'list_nodes',
                    'description' => 'List nodes in the current context. Returns numeric id, hostname, IP, model, vendor, reachability and per-axis scores. Use this to discover what nodes exist before drilling into a specific one.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'limit' => [
                                'type' => 'integer',
                                'description' => 'Max number of nodes to return (default 50, max 200).',
                                'minimum' => 1,
                                'maximum' => 200,
                            ],
                            'reachableOnly' => [
                                'type' => 'boolean',
                                'description' => 'When true, only nodes currently reachable (ping success) are returned.',
                            ],
                            'grades' => [
                                'type' => 'array',
                                'description' => 'Only return nodes whose global grade is in this list. Grades are letters from A (best) to F (worst). Example: ["D","E","F"] to surface the weakest nodes.',
                                'items' => [
                                    'type' => 'string',
                                    'enum' => ['A', 'B', 'C', 'D', 'E', 'F'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
            [
                'type' => 'function',
                'function' => [
                    'name' => 'get_node',
                    'description' => 'Get the full detail of a single node by its numeric id (as returned by list_nodes).',
                    'parameters' => [
                        'type' => 'object',
                        'required' => ['id'],
                        'properties' => [
                            'id' => [
                                'type' => 'integer',
                                'description' => 'Numeric node id.',
                            ],
                        ],
                    ],
                ],
            ],
            [
                'type' => 'function',
                'function' => [
                    'name' => 'list_compliance_failures',
                    'description' => 'List the most recent non-compliant or erroring compliance results in the current context. Returns the offending rule, policy, severity and the rule message. Use this to answer "what is failing right now?" questions.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'limit' => [
                                'type' => 'integer',
                                'description' => 'Max number of results (default 30, max 100).',
                                'minimum' => 1,
                                'maximum' => 100,
                            ],
                            'minSeverity' => [
                                'type' => 'string',
                                'enum' => ['info', 'low', 'medium', 'high', 'critical'],
                                'description' => 'Minimum severity to include.',
                            ],
                            'nodeId' => [
                                'type' => 'integer',
                                'description' => 'Optional numeric node id to scope the results to a single node.',
                            ],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * Execute a tool call by name. Throws on unknown names so the caller
     * can surface a clean error message to the model.
     */
    public function execute(string $name, array $args, AiConversation $conversation): array
    {
        $context = $conversation->getAssistant()?->getContext();
        if ($context === null) {
            return ['error' => 'No context bound to this conversation.'];
        }

        return match ($name) {
            'list_nodes' => $this->listNodes($context, $args),
            'get_node' => $this->getNode($context, $args),
            'list_compliance_failures' => $this->listComplianceFailures($context, $args),
            default => ['error' => sprintf('Unknown tool "%s".', $name)],
        };
    }

    private function listNodes(Context $context, array $args): array
    {
        $limit = max(1, min(200, (int) ($args['limit'] ?? 50)));
        $reachableOnly = (bool) ($args['reachableOnly'] ?? false);
        $allowed = ['A', 'B', 'C', 'D', 'E', 'F'];
        $grades = [];
        if (isset($args['grades']) && is_array($args['grades'])) {
            foreach ($args['grades'] as $g) {
                $g = strtoupper((string) $g);
                if (in_array($g, $allowed, true)) {
                    $grades[] = $g;
                }
            }
            $grades = array_values(array_unique($grades));
        }

        $qb = $this->nodes->createQueryBuilder('n')
            ->where('n.context = :ctx')
            ->setParameter('ctx', $context)
            ->orderBy('n.score', 'DESC')
            ->setMaxResults($limit);
        if ($reachableOnly) {
            $qb->andWhere('n.isReachable = true');
        }
        if ($grades !== []) {
            $qb->andWhere('n.score IN (:grades)')->setParameter('grades', $grades);
        }
        $nodes = $qb->getQuery()->getResult();

        return [
            'count' => count($nodes),
            'nodes' => array_map(
                fn($n) => $this->describer->describeNode($n),
                $nodes,
            ),
        ];
    }

    private function getNode(Context $context, array $args): array
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) return ['error' => 'id argument is required and must be a positive integer'];
        $node = $this->nodes->find($id);
        if ($node === null) {
            return ['error' => sprintf('Node %d not found.', $id)];
        }
        if ($node->getContext()?->getId() !== $context->getId()) {
            return ['error' => 'Node is outside the assistant\'s context.'];
        }
        return $this->describer->describeNode($node);
    }

    private function listComplianceFailures(Context $context, array $args): array
    {
        $limit = max(1, min(100, (int) ($args['limit'] ?? 30)));
        $minSeverity = isset($args['minSeverity']) ? (string) $args['minSeverity'] : null;
        $nodeId = isset($args['nodeId']) ? (int) $args['nodeId'] : null;

        $qb = $this->em->getRepository(ComplianceResult::class)->createQueryBuilder('r')
            ->innerJoin('r.node', 'n')
            ->where('n.context = :ctx')
            ->andWhere("r.status IN ('non_compliant', 'error')")
            ->setParameter('ctx', $context)
            ->orderBy('r.evaluatedAt', 'DESC')
            ->setMaxResults($limit);

        if ($minSeverity !== null) {
            $order = ['info' => 1, 'low' => 2, 'medium' => 3, 'high' => 4, 'critical' => 5];
            $threshold = $order[$minSeverity] ?? 0;
            $accepted = array_keys(array_filter($order, fn(int $v) => $v >= $threshold));
            $qb->andWhere('r.severity IN (:sev)')->setParameter('sev', $accepted);
        }

        if ($nodeId !== null && $nodeId > 0) {
            $node = $this->nodes->find($nodeId);
            if ($node === null || $node->getContext()?->getId() !== $context->getId()) {
                return ['error' => sprintf('Node %d not found in this context.', $nodeId)];
            }
            $qb->andWhere('n = :node')->setParameter('node', $node);
        }

        $results = $qb->getQuery()->getResult();

        return [
            'count' => count($results),
            'failures' => array_map(
                fn(ComplianceResult $r) => $this->describer->describeComplianceResult($r),
                $results,
            ),
        ];
    }
}

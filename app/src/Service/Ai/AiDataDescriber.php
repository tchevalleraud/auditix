<?php

namespace App\Service\Ai;

use App\Entity\ComplianceResult;
use App\Entity\Node;

/**
 * Translates Auditix entities into JSON-friendly arrays for AI tool results.
 *
 * No anonymisation here on purpose: the chat workflow stages every tool
 * payload and asks the user to approve sending it to the LLM (the
 * human-in-the-loop gate). The user sees the exact data that would leave
 * the server before approving, so masking is redundant and only hurts the
 * model's ability to reason about specific hosts.
 *
 * If you ever need to bring anonymisation back (e.g. for a tool that
 * auto-runs without the gate), do it at that tool's boundary rather than
 * here — the gate is the single source of truth on what's safe.
 */
class AiDataDescriber
{
    public function describeNode(Node $node): array
    {
        return [
            'id' => $node->getId(),
            'name' => $node->getName(),
            'hostname' => $node->getHostname(),
            'ipAddress' => $node->getIpAddress(),
            'model' => $node->getModel()?->getName(),
            'vendor' => $node->getManufacturer()?->getName(),
            'profile' => $node->getProfile()?->getName(),
            'discoveredModel' => $node->getDiscoveredModel(),
            'discoveredVersion' => $node->getDiscoveredVersion(),
            'reachable' => $node->getIsReachable(),
            'score' => $node->getScore(),
            'complianceScore' => $node->getComplianceScore(),
            'vulnerabilityScore' => $node->getVulnerabilityScore(),
            'systemUpdateScore' => $node->getSystemUpdateScore(),
            'tags' => array_map(
                fn($t) => method_exists($t, 'getName') ? $t->getName() : (string) $t,
                $node->getTags()->toArray()
            ),
        ];
    }

    public function describeComplianceResult(ComplianceResult $r): array
    {
        $node = $r->getNode();
        return [
            'nodeId' => $node->getId(),
            'nodeName' => $node->getName(),
            'nodeHostname' => $node->getHostname(),
            'rule' => $r->getRule()->getName(),
            'policy' => $r->getPolicy()->getName(),
            'status' => $r->getStatus(),
            'severity' => $r->getSeverity(),
            'message' => $r->getMessage(),
            'evaluatedAt' => $r->getEvaluatedAt()->format('c'),
        ];
    }
}

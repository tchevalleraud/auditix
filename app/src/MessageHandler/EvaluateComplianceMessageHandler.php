<?php

namespace App\MessageHandler;

use App\Entity\CompliancePolicy;
use App\Entity\ComplianceResult;
use App\Entity\ComplianceRule;
use App\Entity\ComplianceRuleFolder;
use App\Entity\Node;
use App\Message\EvaluateComplianceMessage;
use App\Service\ComplianceEvaluator;
use App\Service\VulnerabilityScoreCalculator;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class EvaluateComplianceMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        private readonly ComplianceEvaluator $evaluator,
        private readonly VulnerabilityScoreCalculator $vulnCalculator,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(EvaluateComplianceMessage $message): void
    {
        $policy = $this->em->getRepository(CompliancePolicy::class)->find($message->getPolicyId());
        $node = $this->em->getRepository(Node::class)->find($message->getNodeId());
        if (!$policy || !$node) return;

        // Mark as running and publish status
        $node->setComplianceEvaluating('running');
        $this->em->flush();
        $this->publishProgress($policy, $node, 'running', 0, 0);

        // Collect all rules for this policy
        $rules = $this->collectPolicyRules($policy);

        $this->logger->info('[compliance] start', [
            'policyId' => $policy->getId(),
            'policyName' => $policy->getName(),
            'nodeId' => $node->getId(),
            'ip' => $node->getIpAddress(),
            'rulesTotal' => count($rules),
        ]);
        $t0 = microtime(true);

        // Delete old results for this (policy, node)
        $this->em->createQuery(
            'DELETE FROM App\Entity\ComplianceResult r WHERE r.policy = :policy AND r.node = :node'
        )->setParameter('policy', $policy)->setParameter('node', $node)->execute();

        // Evaluate each rule
        $stats = ['compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0, 'skipped' => 0];
        $penaltySum = 0;
        $evaluated = 0;

        foreach ($rules as $rule) {
            $this->logger->info('[compliance] rule', [
                'policyId' => $policy->getId(),
                'nodeId' => $node->getId(),
                'ip' => $node->getIpAddress(),
                'ruleId' => $rule->getId(),
                'ruleName' => $rule->getName(),
            ]);
            $evaluation = $this->evaluator->evaluateRule($rule, $node);

            $result = new ComplianceResult();
            $result->setPolicy($policy);
            $result->setRule($rule);
            $result->setNode($node);
            $result->setStatus($evaluation['status'] ?? 'error');
            $result->setSeverity($evaluation['severity'] ?? null);
            $result->setMessage($evaluation['message'] ?? null);
            $result->setMessageLong($evaluation['messageLong'] ?? null);
            $result->setRecommendation($evaluation['recommendation'] ?? null);
            $result->setRecommendationType($evaluation['recommendationType'] ?? null);
            $result->setEvaluatedAt(new \DateTimeImmutable());
            $this->em->persist($result);

            $status = $evaluation['status'] ?? 'error';
            if (isset($stats[$status])) $stats[$status]++;
            else $stats['error']++;

            if ($status === 'non_compliant') {
                $severity = $evaluation['severity'] ?? 'info';
                $penaltySum += ComplianceEvaluator::SEVERITY_WEIGHTS[$severity] ?? 0;
            } elseif ($status === 'error') {
                // Errors are penalized with maximum weight (critical) since compliance cannot be verified
                $penaltySum += ComplianceEvaluator::SEVERITY_WEIGHTS['critical'] ?? 10;
            }

            $evaluated++;
            if ($evaluated % 5 === 0) {
                $this->em->flush();
                $this->publishProgress($policy, $node, 'running', $evaluated, count($rules));
            }
        }

        $this->em->flush();

        // Recalculate global score from ALL compliance results for this node (all policies)
        // Use a direct SQL query to avoid ORM cache issues with concurrent workers
        $conn = $this->em->getConnection();
        $rows = $conn->fetchAllAssociative(
            'SELECT cr.status, cr.severity, COUNT(*) as cnt
             FROM compliance_result cr
             INNER JOIN compliance_policy cp ON cp.id = cr.policy_id
             WHERE cr.node_id = :nodeId AND cp.enabled = true
             GROUP BY cr.status, cr.severity',
            ['nodeId' => $node->getId()]
        );

        $globalPenalty = 0;
        $globalScorable = 0;

        foreach ($rows as $row) {
            $st = $row['status'];
            $cnt = (int) $row['cnt'];
            if ($st === 'skipped' || $st === 'not_applicable') continue;
            $globalScorable += $cnt;
            if ($st === 'non_compliant') {
                $globalPenalty += (ComplianceEvaluator::SEVERITY_WEIGHTS[$row['severity'] ?? 'info'] ?? 0) * $cnt;
            } elseif ($st === 'error') {
                $globalPenalty += (ComplianceEvaluator::SEVERITY_WEIGHTS['critical'] ?? 10) * $cnt;
            }
        }

        $complianceGrade = ComplianceEvaluator::calculateGrade($globalScorable, $globalPenalty);
        $node->setComplianceScore($complianceGrade);

        // Combine compliance with vulnerability and/or system-update sub-scores when enabled.
        // recalculateNodeScore handles all enable-flag combinations internally.
        $context = $node->getContext();
        if ($context) {
            $grade = $this->vulnCalculator->recalculateNodeScore($node);
        } else {
            $grade = $complianceGrade;
            $node->setScore($grade);
        }

        $node->setComplianceEvaluating(null);

        $this->em->flush();

        $this->logger->info('[compliance] done', [
            'policyId' => $policy->getId(),
            'nodeId' => $node->getId(),
            'ip' => $node->getIpAddress(),
            'grade' => $grade,
            'stats' => $stats,
            'durationMs' => (int) ((microtime(true) - $t0) * 1000),
        ]);

        // Publish completion
        $this->publishCompletion($policy, $node, $grade, $stats, count($rules));
    }

    /**
     * Collect all enabled rules: from the policy folder tree + extra rules.
     * @return ComplianceRule[]
     */
    private function collectPolicyRules(CompliancePolicy $policy): array
    {
        $ruleIds = [];
        $rules = [];

        // Rules from folder tree
        $rootFolder = $this->em->getRepository(ComplianceRuleFolder::class)->findOneBy([
            'policy' => $policy,
            'parent' => null,
        ]);

        if ($rootFolder) {
            $this->collectFolderRules($rootFolder, $rules, $ruleIds);
        }

        // Extra rules
        foreach ($policy->getExtraRules() as $rule) {
            if (!isset($ruleIds[$rule->getId()])) {
                $ruleIds[$rule->getId()] = true;
                $rules[] = $rule;
            }
        }

        return $rules;
    }

    private function collectFolderRules(ComplianceRuleFolder $folder, array &$rules, array &$ruleIds): void
    {
        $folderRules = $this->em->getRepository(ComplianceRule::class)->findBy(['folder' => $folder]);
        foreach ($folderRules as $rule) {
            if (!isset($ruleIds[$rule->getId()])) {
                $ruleIds[$rule->getId()] = true;
                $rules[] = $rule;
            }
        }

        $children = $this->em->getRepository(ComplianceRuleFolder::class)->findBy(['parent' => $folder]);
        foreach ($children as $child) {
            $this->collectFolderRules($child, $rules, $ruleIds);
        }
    }

    private function publishProgress(CompliancePolicy $policy, Node $node, string $status, int $evaluated, int $total): void
    {
        $payload = json_encode([
            'event' => 'compliance.progress',
            'policyId' => $policy->getId(),
            'nodeId' => $node->getId(),
            'status' => $status,
            'evaluated' => $evaluated,
            'total' => $total,
        ]);

        $this->hub->publish(new Update('compliance/policy/' . $policy->getId(), $payload));
        $this->hub->publish(new Update('compliance/node/' . $node->getId(), $payload));
    }

    private function publishCompletion(CompliancePolicy $policy, Node $node, string $grade, array $stats, int $total): void
    {
        $payload = json_encode([
            'event' => 'compliance.evaluated',
            'policyId' => $policy->getId(),
            'nodeId' => $node->getId(),
            'score' => $grade,
            'complianceScore' => $node->getComplianceScore(),
            'vulnerabilityScore' => $node->getVulnerabilityScore(),
            'stats' => $stats,
            'total' => $total,
            'evaluatedAt' => (new \DateTimeImmutable())->format('c'),
        ]);

        $this->hub->publish(new Update('compliance/policy/' . $policy->getId(), $payload));
        $this->hub->publish(new Update('compliance/node/' . $node->getId(), $payload));
    }
}

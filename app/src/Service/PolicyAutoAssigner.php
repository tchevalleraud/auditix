<?php

namespace App\Service;

use App\Entity\CompliancePolicy;
use App\Entity\Node;
use Doctrine\ORM\EntityManagerInterface;

class PolicyAutoAssigner
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly NodeMatchEvaluator $evaluator,
    ) {}

    /**
     * Evaluate matchRules of every enabled policy in $node's context and
     * add/remove $node accordingly. Returns the enabled policies the node now
     * belongs to (matchRules-driven + manually assigned).
     *
     * @return CompliancePolicy[]
     */
    public function autoAssign(Node $node): array
    {
        $context = $node->getContext();
        if (!$context) {
            return [];
        }

        $policies = $this->em->getRepository(CompliancePolicy::class)->findBy([
            'context' => $context,
            'enabled' => true,
        ]);

        $changed = false;
        foreach ($policies as $policy) {
            $rules = $policy->getMatchRules();
            if (!$rules || empty($rules['blocks'] ?? [])) {
                continue;
            }

            $verdict = $this->evaluator->evaluateNode($node, $rules);
            if ($verdict === 'include' && !$policy->getNodes()->contains($node)) {
                $policy->addNode($node);
                $changed = true;
            } elseif ($verdict === 'exclude' && $policy->getNodes()->contains($node)) {
                $policy->removeNode($node);
                $changed = true;
            }
        }

        if ($changed) {
            $this->em->flush();
        }

        return array_values(array_filter($policies, fn(CompliancePolicy $p) => $p->getNodes()->contains($node)));
    }
}

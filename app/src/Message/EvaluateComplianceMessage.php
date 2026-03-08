<?php

namespace App\Message;

class EvaluateComplianceMessage
{
    public function __construct(
        private readonly int $policyId,
        private readonly int $nodeId,
    ) {}

    public function getNodeId(): int
    {
        return $this->nodeId;
    }

    public function getPolicyId(): int
    {
        return $this->policyId;
    }
}

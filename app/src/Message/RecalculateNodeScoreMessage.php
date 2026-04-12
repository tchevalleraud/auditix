<?php

namespace App\Message;

class RecalculateNodeScoreMessage
{
    public function __construct(
        private readonly int $nodeId,
    ) {}

    public function getNodeId(): int { return $this->nodeId; }
}

<?php

namespace App\Message;

class EnforceNodeMessage
{
    public function __construct(
        private readonly int $nodeId,
    ) {}

    public function getNodeId(): int
    {
        return $this->nodeId;
    }
}

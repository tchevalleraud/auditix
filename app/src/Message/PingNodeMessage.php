<?php

namespace App\Message;

class PingNodeMessage
{
    public function __construct(
        private readonly int $nodeId,
        private readonly ?int $taskId = null,
    ) {}

    public function getNodeId(): int
    {
        return $this->nodeId;
    }

    public function getTaskId(): ?int
    {
        return $this->taskId;
    }
}

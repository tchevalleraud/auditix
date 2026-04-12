<?php

namespace App\Message;

class SyncCveMessage
{
    public function __construct(
        private readonly int $contextId,
        private readonly ?int $deviceModelId = null,
    ) {}

    public function getContextId(): int { return $this->contextId; }
    public function getDeviceModelId(): ?int { return $this->deviceModelId; }
}

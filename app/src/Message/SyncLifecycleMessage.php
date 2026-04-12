<?php

namespace App\Message;

class SyncLifecycleMessage
{
    public function __construct(
        private readonly int $contextId,
        private readonly ?string $pluginIdentifier = null,
    ) {}

    public function getContextId(): int
    {
        return $this->contextId;
    }

    public function getPluginIdentifier(): ?string
    {
        return $this->pluginIdentifier;
    }
}

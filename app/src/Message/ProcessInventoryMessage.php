<?php

namespace App\Message;

class ProcessInventoryMessage
{
    public function __construct(
        private readonly int $collectionId,
        private readonly bool $chainCompliance = false,
        private readonly ?string $tagName = null,
    ) {}

    public function getCollectionId(): int
    {
        return $this->collectionId;
    }

    public function shouldChainCompliance(): bool
    {
        return $this->chainCompliance;
    }

    public function getTagName(): ?string
    {
        return $this->tagName;
    }
}

<?php

namespace App\Message;

class CollectNodeMessage
{
    private bool $chainCompliance = false;

    public function __construct(
        private readonly int $collectionId,
        bool $chainCompliance = false,
    ) {
        $this->chainCompliance = $chainCompliance;
    }

    public function getCollectionId(): int
    {
        return $this->collectionId;
    }

    public function shouldChainCompliance(): bool
    {
        return isset($this->chainCompliance) ? $this->chainCompliance : false;
    }
}

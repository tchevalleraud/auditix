<?php

namespace App\Message;

class CollectNodeMessage
{
    public function __construct(
        private readonly int $collectionId,
    ) {}

    public function getCollectionId(): int
    {
        return $this->collectionId;
    }
}

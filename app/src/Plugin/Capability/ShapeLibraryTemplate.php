<?php

namespace App\Plugin\Capability;

final class ShapeLibraryTemplate
{
    /**
     * @param ShapeLibraryItemTemplate[] $items
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description = '',
        public readonly array $items = [],
    ) {}
}

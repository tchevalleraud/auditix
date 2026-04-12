<?php

namespace App\Plugin;

class LifecycleData
{
    /**
     * @param string[] $modelPatterns Regex or glob patterns to match DeviceModel names
     */
    public function __construct(
        public readonly string $productRangeName,
        public readonly ?string $recommendedVersion = null,
        public readonly ?string $currentVersion = null,
        public readonly ?\DateTimeImmutable $releaseDate = null,
        public readonly ?\DateTimeImmutable $endOfSaleDate = null,
        public readonly ?\DateTimeImmutable $endOfSupportDate = null,
        public readonly ?\DateTimeImmutable $endOfLifeDate = null,
        public readonly array $modelPatterns = [],
    ) {}
}

<?php

namespace App\Plugin\Capability;

use App\Entity\Context;
use App\Plugin\LifecycleData;

interface ProvidesLifecycleData
{
    /**
     * @return LifecycleData[]
     */
    public function fetchLifecycleData(Context $context, array $config = []): array;
}

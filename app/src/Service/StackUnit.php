<?php

namespace App\Service;

/**
 * A single physical unit of a (possibly stacked) device, derived on the fly from
 * the inventory by StackResolver. A non-stacked node yields exactly one implicit
 * unit carrying the node's own model/version and no serial.
 */
final class StackUnit
{
    /**
     * @param string                 $key      inventory entry key identifying the unit (e.g. "1", "Unit 2")
     * @param string|null            $serial   serial number, if mapped/available
     * @param string|null            $model    model string used for lifecycle matching
     * @param string|null            $version  firmware/software version, if mapped
     * @param array<string, ?string> $columns  every column of the unit's inventory row (colLabel => value)
     * @param bool                   $implicit true when synthesised from the node itself (no stack data)
     */
    public function __construct(
        public readonly string $key,
        public readonly ?string $serial = null,
        public readonly ?string $model = null,
        public readonly ?string $version = null,
        public readonly array $columns = [],
        public readonly bool $implicit = false,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'serial' => $this->serial,
            'model' => $this->model,
            'version' => $this->version,
            'columns' => $this->columns,
            'implicit' => $this->implicit,
        ];
    }
}

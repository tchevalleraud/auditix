<?php

namespace App\Plugin\Capability;

final class RuleTemplate
{
    public const SOURCE_LOCAL = 'local';
    public const SOURCE_SSH = 'ssh';

    /**
     * @param ExtractTemplate[] $extracts
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $folderPath,
        public readonly string $source,
        public readonly ?string $command,
        public readonly bool $enabled,
        public readonly array $extracts,
    ) {}
}

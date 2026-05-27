<?php

namespace App\Plugin\Capability;

final class ExtractTemplate
{
    public const EXTRACT_MODE_LINE = 'line';
    public const EXTRACT_MODE_BLOCK = 'block';

    public const KEY_MODE_EXTRACT = 'extract';
    public const KEY_MODE_MANUAL = 'manual';

    /**
     * Reflète la structure de CollectionRuleExtract (cf. Entity/CollectionRuleExtract.php).
     * Tous les champs avancés (mode BLOCK) sont optionnels.
     */
    public function __construct(
        public readonly string $name,
        public readonly string $regex,
        public readonly bool $multiline = false,
        public readonly string $extractMode = self::EXTRACT_MODE_LINE,
        public readonly string $keyMode = self::KEY_MODE_MANUAL,
        public readonly ?string $keyManual = null,
        public readonly ?int $keyGroup = null,
        public readonly ?int $valueGroup = null,
        public readonly ?array $valueMap = null,
        public readonly ?string $categoryName = null,
        public readonly ?string $nodeField = null,
        public readonly ?string $blockSeparator = null,
        public readonly ?int $blockKeyGroup = null,
        public readonly ?string $blockKeyTemplate = null,
        public readonly ?array $blockCaptures = null,
    ) {}
}

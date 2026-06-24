<?php

namespace App\Service\Report;

use App\Entity\Node;
use App\Entity\Report;

/**
 * Mutable rendering context threaded through every block renderer, mirroring the
 * arguments the PDF renderBlocks() carries around (theme styles, heading
 * numbering counters, current node scope...).
 */
final class WordRenderContext
{
    /** @var array<int,int> heading counters keyed by level (1..6) */
    public array $counters = [];

    /** @var list<array{label:string,number:int}> collected figure captions */
    public array $figures = [];

    /** @var list<string> temp image files to delete only after the docx is saved */
    public array $tempFiles = [];

    public function __construct(
        public readonly Report $report,
        public readonly ?Node $forNode,
        /** @var array<string,mixed> resolved theme styles */
        public readonly array $styles,
        /** @var array<int,array<string,mixed>> heading styles keyed by level */
        public readonly array $headingsByLevel,
        public readonly bool $numberingEnabled,
        /** @var array<string,string> document variables (title, subtitle, ...) */
        public readonly array $variables,
    ) {}

    public function bodyFont(): string
    {
        return WordStyleHelper::mapFont((string) ($this->styles['body']['font'] ?? 'Calibri'));
    }

    public function bodySize(): float
    {
        return (float) ($this->styles['body']['size'] ?? 11);
    }

    public function bodyColor(): ?string
    {
        return WordStyleHelper::color($this->styles['body']['color'] ?? null);
    }
}

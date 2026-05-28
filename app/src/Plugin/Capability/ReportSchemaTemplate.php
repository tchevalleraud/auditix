<?php

namespace App\Plugin\Capability;

final class ReportSchemaTemplate
{
    /**
     * @param string     $name        Nom du schéma.
     * @param array      $elements    Éléments du canvas (union discriminée par `kind` :
     *                                shape | text | image | line | freedraw | bezier |
     *                                group | node_card_styled | node_card_table).
     * @param array|null $canvasSize  { "width": n, "height": n } ou null (auto-fit).
     * @param int        $gridSize    Pas de la grille (px).
     * @param bool       $snapToGrid  Accrochage à la grille.
     */
    public function __construct(
        public readonly string $name,
        public readonly array $elements,
        public readonly string $description = '',
        public readonly ?array $canvasSize = null,
        public readonly int $gridSize = 20,
        public readonly bool $snapToGrid = true,
    ) {}
}

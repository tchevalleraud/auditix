<?php

namespace App\Plugin\Capability;

final class ReportTemplate
{
    /**
     * @param string      $name      Nom interne du rapport.
     * @param string      $title     Titre affiché en couverture.
     * @param array       $blocks    Contenu structuré : liste de blocs typés
     *                               (['type' => 'heading'|'paragraph'|..., ...]).
     * @param string|null $themeName Nom d'un ReportTheme à résoudre comme FK.
     *                               Si null ou introuvable, le thème par défaut du
     *                               contexte est utilisé (le rapport exige un thème).
     * @param array       $authors   Liste d'auteurs (structure libre, ex: [['name' => '...']]).
     */
    public function __construct(
        public readonly string $name,
        public readonly string $title,
        public readonly array $blocks,
        public readonly ?string $themeName = null,
        public readonly string $description = '',
        public readonly ?string $subtitle = null,
        public readonly string $locale = 'fr',
        public readonly bool $showTableOfContents = true,
        public readonly bool $showAuthorsPage = true,
        public readonly array $authors = [],
    ) {}
}

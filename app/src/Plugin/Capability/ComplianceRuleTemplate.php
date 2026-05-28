<?php

namespace App\Plugin\Capability;

final class ComplianceRuleTemplate
{
    /**
     * Reflète la structure de l'entité ComplianceRule.
     *
     * @param string      $name           Nom de la règle.
     * @param array       $dataSources    Sources de données : chaque entrée décrit
     *                                    d'où lire une valeur (collection/ssh), avec
     *                                    name/type/command/regex/resultMode/...
     * @param array       $conditionTree  Arbre IF/ELSEIF/ELSE : ['blocks' => [...]].
     *                                    Chaque bloc porte conditions + result
     *                                    (status/severity/message).
     * @param string|null $identifier     Identifiant technique stable (optionnel).
     * @param array|null  $multiRowMessages Messages agrégés par statut (multi-row).
     * @param string|null $folderName     Sous-dossier de rangement (optionnel).
     */
    public function __construct(
        public readonly string $name,
        public readonly array $dataSources,
        public readonly array $conditionTree,
        public readonly string $description = '',
        public readonly ?string $identifier = null,
        public readonly bool $enabled = true,
        public readonly ?array $multiRowMessages = null,
        public readonly ?string $folderName = null,
    ) {}
}

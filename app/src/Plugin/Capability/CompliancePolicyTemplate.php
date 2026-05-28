<?php

namespace App\Plugin\Capability;

final class CompliancePolicyTemplate
{
    /**
     * @param string     $name        Nom de la politique.
     * @param array|null $matchRules  Critères d'application automatique aux nodes
     *                                (ex: par tag / manufacturer / model). null = aucun.
     * @param ComplianceRuleTemplate[] $rules Règles rattachées à la politique
     *                                (créées puis ajoutées comme extraRules).
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description = '',
        public readonly bool $enabled = true,
        public readonly ?array $matchRules = null,
        public readonly array $rules = [],
    ) {}
}

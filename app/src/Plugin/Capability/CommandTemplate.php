<?php

namespace App\Plugin\Capability;

final class CommandTemplate
{
    /**
     * @param string $folderPath Chemin hiérarchique slashé, ex: "Extreme Networks/EXOS".
     *                           Les dossiers manquants sont créés à l'import.
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $commands,
        public readonly string $folderPath,
        public readonly bool $enabled = true,
    ) {}
}

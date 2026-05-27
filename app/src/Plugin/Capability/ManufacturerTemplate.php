<?php

namespace App\Plugin\Capability;

final class ManufacturerTemplate
{
    /**
     * @param string $name        Editor name (also used as join key for DeviceModelTemplate.manufacturerName)
     * @param string $description Description courte
     * @param string|null $logoPath Chemin relatif au plugin (ex: "assets/logo.png") pointant
     *                              vers un PNG/SVG. Copié dans var/uploads/logos/ à l'import.
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description = '',
        public readonly ?string $logoPath = null,
    ) {}
}

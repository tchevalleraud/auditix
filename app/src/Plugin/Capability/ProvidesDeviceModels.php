<?php

namespace App\Plugin\Capability;

interface ProvidesDeviceModels
{
    /**
     * Templates de DeviceModel à créer dans le contexte à l'activation.
     * Le DeviceModelTemplate référence un manufacturer par nom — qui doit
     * être présent (soit fourni par le plugin via ProvidesManufacturers,
     * soit déjà créé manuellement par l'admin). Si non trouvé, le model est skip.
     *
     * @return DeviceModelTemplate[]
     */
    public function provideDeviceModels(): array;
}

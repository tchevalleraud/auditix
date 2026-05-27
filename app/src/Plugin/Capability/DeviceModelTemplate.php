<?php

namespace App\Plugin\Capability;

final class DeviceModelTemplate
{
    /**
     * @param string $name              DeviceModel name (ex: "Fabric Engine")
     * @param string $manufacturerName  Editor.name à résoudre comme FK
     * @param string $description       Optionnel
     * @param string|null $connectionScript SSH connection script (e.g. "enable\n")
     * @param string|null $sendCtrlChar Single char to send as Ctrl-X (e.g. "C" for Ctrl-C)
     * @param string|null $nvdKeyword   Keyword utilisé pour matcher dans la base CVE NVD
     */
    public function __construct(
        public readonly string $name,
        public readonly string $manufacturerName,
        public readonly string $description = '',
        public readonly ?string $connectionScript = null,
        public readonly ?string $sendCtrlChar = null,
        public readonly ?string $nvdKeyword = null,
    ) {}
}

<?php

namespace Auditix\Plugin\ExtremeNetworks;

use App\Plugin\Capability\CommandTemplate;
use App\Plugin\Capability\DeviceModelTemplate;
use App\Plugin\Capability\ExtractTemplate;
use App\Plugin\Capability\ManufacturerTemplate;
use App\Plugin\Capability\ProvidesCommands;
use App\Plugin\Capability\ProvidesConfigurationSchema;
use App\Plugin\Capability\ProvidesDeviceModels;
use App\Plugin\Capability\ProvidesExtractionRules;
use App\Plugin\Capability\ProvidesManufacturers;
use App\Plugin\Capability\RuleTemplate;
use App\Plugin\VendorPluginInterface;

/**
 * Plugin catalogue Extreme Networks : manufacturer + OS models + commandes /
 * règles d'extraction d'exemple pour Fabric Engine.
 *
 * Pour les dates de cycle de vie (EoS / EoSupport / EoL), installer aussi
 * le plugin séparé 'extreme-networks-lifecycle'.
 */
final class ExtremeNetworksPlugin implements
    VendorPluginInterface,
    ProvidesManufacturers,
    ProvidesDeviceModels,
    ProvidesCommands,
    ProvidesExtractionRules,
    ProvidesConfigurationSchema
{
    private const MANUFACTURER = 'Extreme Networks';

    public function getIdentifier(): string     { return 'extreme-networks'; }
    public function getVersion(): string         { return '1.0.0'; }
    public function getDisplayName(): string     { return 'Extreme Networks'; }
    public function getDescription(): string     { return 'Catalogue Extreme Networks (manufacturer, OS, commandes/règles d\'exemple).'; }
    public function getSupportedManufacturers(): array { return [self::MANUFACTURER, 'Extreme']; }

    public function getConfigurationSchema(): array
    {
        // Pas d'options exposées (le scraper de lifecycle est dans un autre plugin).
        // Exemple de schema à ajouter au besoin :
        //   ['fields' => [['name' => 'foo', 'type' => 'text', 'label' => 'Foo']]]
        return [];
    }

    public function provideManufacturers(): array
    {
        return [
            new ManufacturerTemplate(
                name: self::MANUFACTURER,
                description: 'Constructeur d\'équipements réseau (Switch Engine / EXOS, Fabric Engine / VOSS, ERS).',
                logoPath: 'assets/logo.jpeg',
            ),
        ];
    }

    public function provideDeviceModels(): array
    {
        return [
            new DeviceModelTemplate(
                name: 'Fabric Engine',
                manufacturerName: self::MANUFACTURER,
                description: 'OS Fabric Engine (anciennement VOSS) — VSP, ExtremeSwitching universel.',
                connectionScript: null,
                sendCtrlChar: 'C',
                nvdKeyword: 'fabric_engine',
            ),
            new DeviceModelTemplate(
                name: 'Switch Engine',
                manufacturerName: self::MANUFACTURER,
                description: 'OS Switch Engine (anciennement EXOS) — Summit, X-Series, ExtremeSwitching universel.',
                connectionScript: null,
                sendCtrlChar: 'C',
                nvdKeyword: 'extremexos',
            ),
            new DeviceModelTemplate(
                name: 'ERS',
                manufacturerName: self::MANUFACTURER,
                description: 'OS ERS (Ethernet Routing Switch) — ERS 3500/3600/4800/4900/5520/5900.',
                connectionScript: null,
                sendCtrlChar: 'C',
                nvdKeyword: 'ers',
            ),
            new DeviceModelTemplate(
                name: 'ISW',
                manufacturerName: self::MANUFACTURER,
                description: 'OS ISW (Industrial Switch) — switches industriels durcis.',
                connectionScript: null,
                sendCtrlChar: 'C',
                nvdKeyword: 'isw',
            ),
        ];
    }

    public function provideCommands(): array
    {
        // Exemples pour Fabric Engine — base utile pour l'audit / inventaire.
        // Multi-commandes par entrée : Auditix envoie chaque ligne en séquence.
        $folder = 'Extreme Networks/Fabric Engine';
        return [
            new CommandTemplate(
                name: 'show sys-info',
                description: 'Informations système : modèle, serial number, uptime, version.',
                commands: "enable\nshow sys-info\n",
                folderPath: $folder,
            ),
            new CommandTemplate(
                name: 'show software',
                description: 'Versions logicielles installées (active + backup).',
                commands: "enable\nshow software\n",
                folderPath: $folder,
            ),
            new CommandTemplate(
                name: 'show running-config',
                description: 'Configuration courante (peut être longue — désactiver le pager).',
                commands: "enable\nterminal more disable\nshow running-config\n",
                folderPath: $folder,
            ),
            new CommandTemplate(
                name: 'show interfaces gigabitethernet',
                description: 'État et statistiques des ports Gigabit.',
                commands: "enable\nshow interfaces gigabitethernet\n",
                folderPath: $folder,
            ),
            new CommandTemplate(
                name: 'show sys-info card',
                description: 'Information de chaque slot (carte mère, modules).',
                commands: "enable\nshow sys-info card\n",
                folderPath: $folder,
            ),
        ];
    }

    public function provideRules(): array
    {
        // Exemple de règle d'extraction : extraire la version logicielle active
        // depuis la sortie de 'show software', et le hostname depuis 'show sys-info'.
        // L'utilisateur peut ajouter ses propres règles en s'inspirant de celles-ci.
        return [
            new RuleTemplate(
                name: 'Fabric Engine — software version',
                description: 'Extrait la version logicielle active (Software Image) depuis show software.',
                folderPath: 'Extreme Networks/Fabric Engine',
                source: RuleTemplate::SOURCE_SSH,
                command: 'show software',
                enabled: true,
                extracts: [
                    new ExtractTemplate(
                        name: 'active-version',
                        regex: '/Active Software Version\s*:\s*(\S+)/i',
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'os_version',
                        valueGroup: 1,
                        nodeField: 'discoveredVersion',
                    ),
                ],
            ),
            new RuleTemplate(
                name: 'Fabric Engine — system info',
                description: 'Extrait hostname, modèle et serial depuis show sys-info.',
                folderPath: 'Extreme Networks/Fabric Engine',
                source: RuleTemplate::SOURCE_SSH,
                command: 'show sys-info',
                enabled: true,
                extracts: [
                    new ExtractTemplate(
                        name: 'hostname',
                        regex: '/SysName\s*:\s*(\S+)/i',
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'hostname',
                        valueGroup: 1,
                        nodeField: 'hostname',
                    ),
                    new ExtractTemplate(
                        name: 'model',
                        regex: '/SysDescr\s*:\s*(\S+)/i',
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'model',
                        valueGroup: 1,
                        nodeField: 'discoveredModel',
                    ),
                    new ExtractTemplate(
                        name: 'serial',
                        regex: '/Serial #\s*:\s*(\S+)/i',
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'serial',
                        valueGroup: 1,
                    ),
                ],
            ),
        ];
    }
}

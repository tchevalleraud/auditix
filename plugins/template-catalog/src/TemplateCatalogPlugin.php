<?php

namespace Auditix\Plugin\TemplateCatalog;

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
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLUGIN TEMPLATE #1 — CATALOG                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LEARNING GOAL
 * -------------
 * Show how a plugin populates a context's catalog with:
 *   1. a manufacturer (Editor entity) + its logo,
 *   2. OS models (DeviceModel entity) attached to the manufacturer,
 *   3. collection commands (CollectionCommand entity) organized in folders,
 *   4. extraction rules (CollectionRule + CollectionRuleExtract).
 *
 * HOW IT WORKS
 * ------------
 * A plugin class implements VendorPluginInterface (required) + one or more
 * "capability" interfaces from the App\Plugin\Capability\ namespace.
 * On ACTIVATION in a context, App\Plugin\PluginAssetsImporter detects the
 * implemented interfaces (via `instanceof`) and calls the provide*() methods.
 * Each *Template object returned is turned into a Doctrine entity carrying the
 * flag `managed_by_plugin = "template-catalog"` (read-only for the USER).
 * On DEACTIVATION, all those entities are purged automatically.
 *
 * GOLDEN RULE: provide*() methods must be PURE and IDEMPOTENT.
 * No database access, no side effects — just build and return *Template objects
 * from static data.
 *
 * Import order guaranteed by PluginAssetsImporter:
 *   manufacturers → device models → commands → rules
 * (so a DeviceModelTemplate may reference a manufacturer by its name; it will
 *  already exist by the time the model is imported).
 */
final class TemplateCatalogPlugin implements
    VendorPluginInterface,
    ProvidesManufacturers,
    ProvidesDeviceModels,
    ProvidesCommands,
    ProvidesExtractionRules,
    ProvidesConfigurationSchema
{
    /**
     * Fake editor name. We keep it in a constant: it acts as the join key
     * between the manufacturer and its device models (see below).
     */
    private const MANUFACTURER = 'DemoVendor';

    // ── Plugin identity (VendorPluginInterface) ─────────────────────────────
    // These 5 methods are REQUIRED. getIdentifier() must match `identifier`
    // in plugin.yaml.

    public function getIdentifier(): string     { return 'template-catalog'; }
    public function getVersion(): string         { return '1.0.0'; }
    public function getDisplayName(): string     { return 'Template — Catalog'; }
    public function getDescription(): string     { return 'Educational example: manufacturer + models + commands + rules.'; }

    /** Editor names covered (display matching against Editor.name). */
    public function getSupportedManufacturers(): array { return [self::MANUFACTURER]; }

    // ── Capability: configuration page (ProvidesConfigurationSchema) ─────────
    // Returning a schema of fields renders a "Configure" form in the UI.
    // Here we leave it empty (static catalog) but document the format.

    public function getConfigurationSchema(): array
    {
        // Full format (uncomment to expose a config page):
        //   return ['fields' => [
        //       ['name' => 'api_token', 'type' => 'password', 'label' => 'API token'],
        //       ['name' => 'verbose',   'type' => 'boolean',  'label' => 'Verbose mode', 'default' => false],
        //   ]];
        // Supported types: text, password, number, boolean, select, multiselect, textarea.
        return [];
    }

    // ── Capability: manufacturers (ProvidesManufacturers) ────────────────────

    /**
     * @return ManufacturerTemplate[]
     */
    public function provideManufacturers(): array
    {
        return [
            new ManufacturerTemplate(
                name: self::MANUFACTURER,
                description: 'Demonstration editor used by the template plugin. Replace with a real vendor.',
                // Path RELATIVE to the plugin archive. The file is copied into
                // var/uploads/logos/ at import time. Set to null for no logo.
                logoPath: 'assets/logo.png',
            ),
        ];
    }

    // ── Capability: device models (ProvidesDeviceModels) ─────────────────────

    /**
     * @return DeviceModelTemplate[]
     */
    public function provideDeviceModels(): array
    {
        return [
            new DeviceModelTemplate(
                name: 'DemoOS',
                // Must match EXACTLY a manufacturer name (above or already present
                // in the context) — this is the FK join key.
                manufacturerName: self::MANUFACTURER,
                description: 'Fictional demonstration operating system.',
                // SSH connection script played when the session opens (or null).
                connectionScript: null,
                // Character sent as Ctrl-X (e.g. "C" => Ctrl-C to stop a pager).
                sendCtrlChar: 'C',
                // Keyword used to match CVEs in the NVD database (or null if N/A).
                nvdKeyword: 'demo_os',
            ),
            new DeviceModelTemplate(
                name: 'DemoOS Lite',
                manufacturerName: self::MANUFACTURER,
                description: 'Lightweight variant — shows a manufacturer can have several models.',
                connectionScript: null,
                sendCtrlChar: 'C',
                nvdKeyword: 'demo_os_lite',
            ),
        ];
    }

    // ── Capability: collection commands (ProvidesCommands) ───────────────────

    /**
     * Commands are organized in a folder tree described by `folderPath`
     * ("A/B/C"). Missing folders are created automatically.
     *
     * @return CommandTemplate[]
     */
    public function provideCommands(): array
    {
        $folder = 'DemoVendor/DemoOS';

        return [
            new CommandTemplate(
                name: 'show version',
                description: 'Shows model, software version and serial number.',
                // Multi-line: Auditix sends each line in sequence. End with \n.
                commands: "show version\n",
                folderPath: $folder,
            ),
            new CommandTemplate(
                name: 'show running-config',
                description: 'Current configuration. Disable the pager first.',
                commands: "terminal length 0\nshow running-config\n",
                folderPath: $folder,
            ),
        ];
    }

    // ── Capability: extraction rules (ProvidesExtractionRules) ───────────────

    /**
     * A RuleTemplate describes HOW to extract information from a command output
     * (SSH source) or a file (LOCAL source), via one or more ExtractTemplate
     * (regex + target). Extracted values can feed Node fields (nodeField) or the
     * inventory (categoryName).
     *
     * @return RuleTemplate[]
     */
    public function provideRules(): array
    {
        return [
            new RuleTemplate(
                name: 'DemoOS — version & serial',
                description: 'Extracts the software version and serial number from "show version".',
                folderPath: 'DemoVendor/DemoOS',
                source: RuleTemplate::SOURCE_SSH,   // SOURCE_SSH (command output) or SOURCE_LOCAL (file)
                command: 'show version',            // associated command/key (null for free SOURCE_LOCAL)
                enabled: true,
                extracts: [
                    new ExtractTemplate(
                        name: 'os-version',
                        // The regex must capture the value in a group (parentheses).
                        regex: '/Version\s*:\s*(\S+)/i',
                        // KEY_MODE_MANUAL: the inventory key is fixed by keyManual.
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'os_version',
                        // Capture group number holding the VALUE.
                        valueGroup: 1,
                        // Node field filled automatically (or null).
                        nodeField: 'discoveredVersion',
                    ),
                    new ExtractTemplate(
                        name: 'serial',
                        regex: '/Serial Number\s*:\s*(\S+)/i',
                        keyMode: ExtractTemplate::KEY_MODE_MANUAL,
                        keyManual: 'serial',
                        valueGroup: 1,
                        // No nodeField: the value stays an inventory data point.
                    ),
                ],
            ),
        ];
    }
}

# Template — Catalog

Educational **template plugin**. It shows how a Vendor Plugin populates a
context's catalog with four kinds of related resources:

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Manufacturer (+ logo) | `Editor` | `ProvidesManufacturers` |
| OS model | `DeviceModel` | `ProvidesDeviceModels` |
| Collection command | `CollectionCommand` | `ProvidesCommands` |
| Extraction rule | `CollectionRule` / `CollectionRuleExtract` | `ProvidesExtractionRules` |

All data is **fake** (`DemoVendor` / `DemoOS`). Duplicate this folder and replace
the content to build a real vendor catalog.

## Anatomy of a plugin

```
template-catalog/
├── plugin.yaml          # Manifest (validated at install time)
├── icon.png             # Icon shown in the UI
├── assets/
│   └── logo.png         # Manufacturer logo (referenced by logoPath)
└── src/
    └── TemplateCatalogPlugin.php   # Main class (entry point)
```

## Principle

1. The class implements `VendorPluginInterface` (identity) + the `Provides*`
   interfaces matching the resources it provides.
2. On **activation** in a context, `PluginAssetsImporter` calls each `provide*()`
   method and creates the entities with the flag
   `managed_by_plugin = template-catalog` (read-only for the user).
3. On **deactivation**, those entities are purged automatically.

> **Golden rule**: `provide*()` methods are pure and idempotent — no DB access,
> no side effects, just return `*Template` objects.

The import order (`manufacturers → models → commands → rules`) guarantees that a
`DeviceModelTemplate` can reference its manufacturer by name.

## Install / activate (dev CLI)

```bash
# Package then install
php bin/console app:plugin:install /path/to/template-catalog.zip
# Activate in a context
php bin/console app:plugin:activate template-catalog <context_id>
# Deactivate (purges the assets)
php bin/console app:plugin:deactivate template-catalog <context_id>
```

## Going further

- Lifecycle (versions / EoL): see the **template-lifecycle** plugin.
- Architecture documentation: `docs/architecture/vendor-plugins.md`.

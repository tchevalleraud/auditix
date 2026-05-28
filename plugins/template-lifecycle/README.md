# Template — Lifecycle

Educational **template plugin**. It shows how to provide **lifecycle data**:
recommended version and key dates (release / End of Sale / End of Support /
End of Life) for product ranges.

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Range + EoL dates | `ProductRange` | `ProvidesLifecycleData` |
| Configuration page | — | `ProvidesConfigurationSchema` |

These dates feed the **System Updates** score: a device in End of Support or
End of Life degrades the context's grade.

## Specificity: periodic synchronization

Unlike the **template-catalog** capabilities (imported once on activation),
`fetchLifecycleData()` is **called periodically** by Auditix, at the frequency
defined by the `sync_interval` config field. That is why a real lifecycle plugin
usually performs a network call here (scraping/API). Here everything is
**static** to stay deterministic.

> `fetchLifecycleData()` must **never** write to the database: it returns
> `LifecycleData` objects, and Auditix handles persistence.

## Range ⇄ device matching

The `modelPatterns` field (array of regex) is tested against the discovered
model on each node. A node whose model matches inherits the range's dates.

```php
modelPatterns: ['/^DemoOS\b/i', '/Core/i'],
```

## Install / activate (dev CLI)

```bash
php bin/console app:plugin:install /path/to/template-lifecycle.zip
php bin/console app:plugin:activate template-lifecycle <context_id>
```

This plugin and **template-catalog** are complementary: one defines the catalog
(manufacturer/models), the other the end-of-life dates.

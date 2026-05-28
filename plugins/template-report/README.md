# Template — Report

Educational **template plugin**. It provides a **report template**: a document
structured in blocks, attached to a theme.

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Report | `Report` | `ProvidesReports` |

## Block structure

The content (`blocks`) is an ordered list of typed blocks. Examples used here:

```php
['type' => 'heading', 'level' => 1, 'content' => 'Introduction']
['type' => 'paragraph', 'content' => '<p>simple HTML</p>', 'align' => 'left']
```

There are advanced blocks (inventory tables, charts, compliance
recommendations, CLI commands…), not used here to stay readable.

## Theme binding

`themeName` is resolved to a `ReportTheme` in the context. If not found, Auditix
falls back to the context's **default theme** (a report always requires a theme).
This template targets the `Template — Teal` theme provided by the
**template-report-theme** plugin — activate it first for the full effect.

## Install / activate (dev CLI)

```bash
php bin/console app:plugin:install /path/to/template-report.zip
php bin/console app:plugin:activate template-report <context_id>
```

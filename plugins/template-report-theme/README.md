# Template — Report theme

Educational **template plugin**. It provides a **theme** (style set) reusable by
the context's PDF and email reports.

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Theme | `ReportTheme` | `ProvidesReportThemes` |

## Principle

The style schema is large (colors, typography, headers/footers, tables, table of
contents, cover page, email styles…). Rather than rewriting all of it, the
plugin starts from `ReportTheme::DEFAULT_STYLES` (already complete and valid) and
overrides only a few keys.

```php
$styles = ReportTheme::DEFAULT_STYLES;
$styles['colors']['primary'] = '#0f766e';
```

> Leaving `styles: []` reuses the default styles as-is.

## Pairing

The **template-report** plugin creates a report that references this theme by
name (`Template — Teal`). Activate both together to see the report take the
theme's colors.

## Install / activate (dev CLI)

```bash
php bin/console app:plugin:install /path/to/template-report-theme.zip
php bin/console app:plugin:activate template-report-theme <context_id>
```

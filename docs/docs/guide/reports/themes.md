---
sidebar_position: 2
---

# Report Themes

Themes control the visual appearance of your generated reports: fonts, colors, headers, footers, and more.

## Default Theme

A default "Classic" theme is created automatically. Every report must have a theme assigned.

## Creating a Theme

1. Navigate to **Report Themes** in the sidebar
2. Click **New theme**
3. Configure the style settings

<!-- ![Theme editor](../../../static/img/screenshots/theme-editor.png) -->

## Theme Settings

### Colors

- **Primary color** — Used for headings and main elements
- **Secondary color** — Used for accents

### Typography

- **Body** — Font family, size, and color for body text
- **Headings** (H1-H6) — Individual styling for each heading level: font, size, bold, italic, color, background, spacing

### Paragraph

- **Alignment** — Left, center, right, or justified
- **Spacing** — Line spacing and paragraph spacing

### Tables

- **Header** — Background color, text color
- **Borders** — Border color
- **Alternate rows** — Enable striped rows with custom background

### CLI Command Blocks

- **Font** — Monospace font for code blocks
- **Colors** — Background, text, border, line numbers
- **Options** — Show/hide line numbers, show/hide header bar

### Header & Footer

Configure what appears on each page:

- **Left / Center / Right** sections
- Content types: text, variable, page number, or none
- Available variables: `title`, `date`, `author`, `context`, `nodeName`, `nodeIp`, `nodeHostname`
- **Separator line** — Enable/disable with custom color

### Cover Page

- **Background color** — Cover page background
- **Elements** — Custom positioned elements on the cover

### Margins

- **Top / Bottom / Left / Right** — Page margins in millimeters

## Import / Export

Themes can be exported and imported as JSON files to share across Auditix instances:

- **Export** — Download the theme configuration
- **Import** — Upload a theme file, with collision detection if a theme with the same name already exists

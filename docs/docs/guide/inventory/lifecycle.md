---
sidebar_position: 2
---

# Lifecycle & system updates

Auditix tracks the lifecycle of each device — manufacturing date, end-of-sale (EoS), end-of-software-maintenance (EoSM), end-of-life (EoL) — plus the gap between the installed software version and the latest available one. These signals feed into the compliance score and a per-device timeline.

## Lifecycle timeline

Open a node and click the **Lifecycle** tab. The timeline shows past events on the left, future ones on the right, with today as the central marker.

| Marker | Meaning |
|---|---|
| Discovery | First time Auditix saw the device. |
| EoS | End of sale — vendor stopped selling the model. |
| EoSM | End of software maintenance — no more bug fixes / security patches. |
| EoL | End of life — no more support. |
| Last update | Timestamp of the latest software version installed. |

Hover any marker for the source and the date.

:::info Screenshot expected
**File**: `static/img/screenshots/inventory/lifecycle-timeline.png`
**Description**: Horizontal timeline rendered on a node detail page. Past markers (Discovery, EoS) on the left, future markers (EoSM, EoL) on the right, "Today" pill at the centre, colour-graded background (green → amber → red as we approach EoL).
:::

## System updates scoring

A device's compliance score includes a **system updates** component — how out of date its software is compared to the latest known version for the same model.

The weight of this component is configurable per context:

| Setting | Default | Meaning |
|---|---|---|
| `systemUpdateScoreWeight` | 0.0 | Set to 0 to ignore the criterion, or any positive value to include it (the higher, the more it pulls the global score down when the device is behind). |

A weight of `1.0` means the system updates score is treated as one full extra policy. Most teams find `0.3`–`0.5` a good starting point.

:::info Screenshot expected
**File**: `static/img/screenshots/inventory/score-weight.png`
**Description**: Context settings panel with a single slider labelled "System updates scoring weight" (range 0.0 → 2.0, step 0.1), current value displayed next to it, and a small explanatory paragraph below.
:::

## Vendor plugins

Lifecycle data and "latest version" lookups are populated by **vendor plugins**. The default install ships with stub plugins; connect real ones under **Administration → Vendor plugins**.

Each plugin exposes:
- a unique `pluginIdentifier`,
- a JSON `configuration` (API URL, credentials, mappings),
- an `enabled` flag,
- a `lastSyncStatus` shown as a coloured pill in the list.

```json
PUT /api/admin/vendor-plugins/cisco-eox
{
  "enabled": true,
  "configuration": {
    "client_id": "...",
    "client_secret": "...",
    "rate_limit_per_minute": 60
  }
}
```

A nightly job calls each enabled plugin to refresh lifecycle data; trigger an immediate refresh with **Sync now** in the plugin row.

:::info Screenshot expected
**File**: `static/img/screenshots/inventory/vendor-plugins.png`
**Description**: Admin → Vendor plugins list showing 3-4 plugins (Cisco EoX, Juniper EoL, Arista EoL), each row with status pill (Connected / Disconnected / Error), last sync timestamp, **Sync now** and **Configure** action buttons.
:::

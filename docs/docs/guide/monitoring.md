---
sidebar_position: 8
---

# Monitoring

Auditix can monitor your network equipment health using SNMP and ICMP protocols.

## Enabling Monitoring

Monitoring is configured per context:

1. Go to **Settings** in the sidebar
2. Enable **Monitoring**
3. Configure the polling intervals:
   - **SNMP poll interval** — How often to collect SNMP metrics (default: 60 seconds)
   - **ICMP poll interval** — How often to check reachability (default: 60 seconds)
   - **SNMP retention** — How long to keep monitoring data (default: 120 minutes)

<!-- ![Monitoring settings](../../../static/img/screenshots/monitoring-settings.png) -->

## Node Monitoring

When monitoring is enabled, each node shows:

### Reachability Status

A colored indicator on the node list and detail page:
- **Green** — Node is reachable (ICMP ping successful)
- **Red** — Node is unreachable
- **Gray** — Status unknown (not yet checked)

### SNMP Metrics

On the node detail page, the **Monitoring** tab displays real-time graphs for:

- **CPU Usage** — Processor utilization percentage
- **Memory** — RAM usage
- **Temperature** — Device temperature sensors
- **Disk** — Storage usage
- **Interface traffic** — Inbound/outbound bandwidth

<!-- ![Monitoring graphs](../../../static/img/screenshots/monitoring-graphs.png) -->

:::info
The Monitoring tab is only visible on nodes when monitoring is enabled in the context settings.
:::

---
sidebar_position: 1
---

# Requirements

Before installing Auditix, make sure your server meets the following requirements.

## System Requirements

| Component        | Minimum            | Recommended         |
|------------------|--------------------|---------------------|
| **OS**           | Linux (any distro) | Ubuntu 22.04+ / Debian 12+ |
| **CPU**          | 2 cores            | 4+ cores            |
| **RAM**          | 2 GB               | 4+ GB               |
| **Disk**         | 10 GB              | 20+ GB              |

## Software Requirements

| Software           | Version  |
|--------------------|----------|
| **Docker**         | 24.0+    |
| **Docker Compose** | 2.20+    |
| **Git**            | 2.0+     |

### Install Docker

If Docker is not installed on your server:

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Verify Installation

```bash
docker --version
docker compose version
```

## Network Requirements

Auditix needs the following network access:

- **Outbound**: Internet access to pull Docker images (only during installation/updates)
- **Inbound**: The HTTP port you configure (default: `80`) must be accessible from client browsers
- **To network equipment**: SSH (port 22) and/or SNMP (port 161/UDP) access from the Docker host to your network devices

## Ports Used

| Port  | Service    | Description                          |
|-------|------------|--------------------------------------|
| 80    | Nginx      | Web interface (configurable via `HTTP_PORT`) |
| 5432  | PostgreSQL | Database (internal only)             |
| 5672  | RabbitMQ   | Message queue (internal only)        |
| 15672 | RabbitMQ   | Management UI (internal only)        |
| 3000  | Next.js    | Frontend (internal only)             |
| 9000  | PHP-FPM    | Backend (internal only)              |

:::info
Only the Nginx port (default `80`) needs to be exposed externally. All other services communicate internally through the Docker network.
:::

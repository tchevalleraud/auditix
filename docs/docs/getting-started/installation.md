---
sidebar_position: 2
---

# Installation

This guide walks you through deploying Auditix using Docker Compose.

## 1. Clone the Repository

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
```

## 2. Configure Environment

Create a `.env` file at the root of the project:

```bash
cp .env.example .env
```

Edit the `.env` file with your settings:

```env title=".env"
# Environment mode
APP_ENV=prod

# Base URL (set to your server IP or domain)
DEFAULT_URI=http://your-server-ip

# Exposed HTTP port (default: 80)
HTTP_PORT=80

# PostgreSQL credentials
POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=change-me-to-a-strong-password

# RabbitMQ credentials
RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=change-me-to-a-strong-password

# Worker replicas (adjust based on your needs)
WORKER_SCHEDULER_REPLICAS=1
WORKER_MONITORING_REPLICAS=1
WORKER_COLLECTOR_REPLICAS=4
WORKER_COMPLIANCE_REPLICAS=2
WORKER_GENERATOR_REPLICAS=1
```

:::warning
Always change the default passwords for PostgreSQL and RabbitMQ in production environments.
:::

## 3. Start the Application

```bash
make up
```

The first startup will:
1. Build the Docker images
2. Pull required base images
3. Install PHP and Node.js dependencies
4. Run database migrations
5. Create the default admin user
6. Build the Next.js frontend for production
7. Warm up the Symfony cache

:::info
The first startup can take several minutes depending on your server's performance. You can monitor progress with:
```bash
docker logs -f auditix-php-1
docker logs -f auditix-node-1
```
:::

## 4. Verify the Installation

Check that all containers are running:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

You should see all containers with status `Up`:

```
NAMES                           STATUS
auditix-nginx-1                 Up 2 minutes
auditix-node-1                  Up 2 minutes
auditix-php-1                   Up 2 minutes
auditix-postgres-1              Up 2 minutes (healthy)
auditix-rabbitmq-1              Up 2 minutes (healthy)
auditix-mercure-1               Up 2 minutes (healthy)
auditix-worker-scheduler-1      Up 2 minutes
auditix-worker-monitoring-1     Up 2 minutes
auditix-worker-collector-1      Up 2 minutes
auditix-worker-compliance-1     Up 2 minutes
auditix-worker-generator-1      Up 2 minutes
auditix-worker-orchestrator-1   Up 2 minutes
auditix-worker-cleanup-1        Up 2 minutes
```

## 5. Access the Interface

Open your browser and navigate to:

```
http://your-server-ip
```

Login with the default credentials:

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `password` |

:::danger
Change the default admin password immediately after your first login by going to **Profile** settings.
:::

## Updating

To update Auditix to a new version:

```bash
make upgrade
```

This command will pull the latest changes, rebuild containers, clear the cache, apply database migrations, and restart all services.

## Troubleshooting

### "Update in progress" page

This is the Nginx 502 fallback page displayed while the Node.js container is building the frontend. Wait a few minutes for the build to complete:

```bash
docker logs -f auditix-node-1
```

When you see `Ready in XXXms`, the application is ready.

### Container keeps restarting

Check the container logs for errors:

```bash
docker logs auditix-php-1
docker logs auditix-node-1
```

Common issues:
- **Database connection refused**: PostgreSQL may not be ready yet. The entrypoint retries automatically.
- **Permission errors**: Ensure the `data/` directory is writable by Docker.

### Reset everything

To start from a completely clean state:

```bash
make down
rm -rf data/postgres data/rabbitmq data/collections
make up
```

:::warning
This will delete all your data including nodes, collections, reports, and compliance results.
:::

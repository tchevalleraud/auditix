---
sidebar_position: 4
---

# Environment Variables

All environment variables are defined in the `.env` file at the root of the project.

## Application

| Variable   | Default | Description |
|------------|---------|-------------|
| `APP_ENV`  | `dev`   | Application environment. Use `prod` for production deployments. |
| `DEFAULT_URI` | `http://localhost` | Base URL of your Auditix instance. Used for generating links. |
| `HTTP_PORT` | `80` | The port Nginx listens on. |

## Database (PostgreSQL)

| Variable            | Default   | Description |
|---------------------|-----------|-------------|
| `POSTGRES_DB`       | `auditix` | Database name. |
| `POSTGRES_USER`     | `auditix` | Database user. |
| `POSTGRES_PASSWORD` | `auditix` | Database password. **Change in production.** |

## Message Queue (RabbitMQ)

| Variable            | Default   | Description |
|---------------------|-----------|-------------|
| `RABBITMQ_USER`     | `auditix` | RabbitMQ user. |
| `RABBITMQ_PASSWORD` | `auditix` | RabbitMQ password. **Change in production.** |

## Real-time (Mercure)

| Variable              | Default                              | Description |
|-----------------------|--------------------------------------|-------------|
| `MERCURE_JWT_SECRET`  | `!ChangeThisMercureHubJWTSecretKey!` | JWT secret for Mercure hub authentication. **Change in production.** |

## Worker Replicas

Scale workers based on your infrastructure size and needs:

| Variable                       | Default | Description |
|--------------------------------|---------|-------------|
| `WORKER_SCHEDULER_REPLICAS`    | `1`     | Monitoring scheduler instances. |
| `WORKER_MONITORING_REPLICAS`   | `3`     | SNMP/ICMP monitoring workers. |
| `WORKER_COLLECTOR_REPLICAS`    | `2`     | Data collection workers. |
| `WORKER_COMPLIANCE_REPLICAS`   | `2`     | Compliance evaluation workers. |
| `WORKER_GENERATOR_REPLICAS`    | `1`     | Report generation workers. |
| `WORKER_SCHEDULER_PROCESSES`   | `1`     | Consumers per scheduler container. |
| `WORKER_MONITORING_PROCESSES`  | `4`     | Consumers per monitoring container. |
| `WORKER_COLLECTOR_PROCESSES`   | `4`     | Consumers per collector container. |
| `WORKER_GENERATOR_PROCESSES`   | `2`     | Consumers per generator container. |

The total concurrency for a pool is `replicas × processes`. Both can also be tuned live from **Administration → Server → Workers** — see the [Worker pools page](./server/workers).

## Authentication & sessions

| Variable | Default | Description |
|---|---|---|
| `OIDC_CALLBACK_BASE_URL` | derived from `DEFAULT_URI` | Base URL announced to OIDC providers (`/api/auth/oidc/{slug}/callback`). Override only when behind a path rewriter. |
| `SESSION_LIFETIME_SECONDS` | `28800` | Absolute session lifetime (default 8 h). |
| `IDLE_TIMEOUT_SECONDS` | configurable in GUI | Initial idle timeout. The GUI value wins once set. |

## Audit & syslog

| Variable | Default | Description |
|---|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | `365` | Days to keep entries in the local DB. `0` = forever. |
| `SYSLOG_FORWARD_RETRY_MAX_SECONDS` | `300` | Backoff cap before a syslog message is dropped after repeated forwarding failures. |

## API

| Variable | Default | Description |
|---|---|---|
| `API_RATE_LIMIT_PER_MINUTE` | `600` | Requests per minute per token. `0` disables the limiter. |
| `API_TOKEN_DEFAULT_TTL_DAYS` | `365` | Default TTL applied when creating a token without explicit expiry. |

## Uploads

| Variable | Default | Description |
|---|---|---|
| `UPLOAD_MAX_SIZE_MB` | `50` | Hard cap on uploaded files (CSV imports, ZIP archives, certificates). |

### Scaling Guidelines

- **Small** (< 50 nodes): Default values are sufficient.
- **Medium** (50-200 nodes): Increase collector to `4`, monitoring to `3`.
- **Large** (200+ nodes): Increase collector to `6-8`, monitoring to `5`, compliance to `4`.

## Example Production Configuration

```env title=".env"
APP_ENV=prod
DEFAULT_URI=https://auditix.example.com
HTTP_PORT=443

POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=s3cur3-p4ssw0rd-h3r3

RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=4n0th3r-s3cur3-p4ss

MERCURE_JWT_SECRET=y0ur-m3rcur3-jwt-s3cr3t

WORKER_SCHEDULER_REPLICAS=1
WORKER_MONITORING_REPLICAS=3
WORKER_COLLECTOR_REPLICAS=4
WORKER_COMPLIANCE_REPLICAS=2
WORKER_GENERATOR_REPLICAS=1
```

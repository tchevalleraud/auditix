# Auditix

Auditix is a network audit and compliance platform. It manages a fleet of network devices, automatically collects their configurations via SSH, and evaluates their compliance against security policies with real-time scoring.

## Architecture

The project is composed of three main layers, orchestrated by Docker Compose:

```
┌─────────────────────────────────────────────────────────┐
│                   Nginx (HTTP_PORT)                      │
│                    Reverse Proxy                         │
├──────────────────┬──────────────────┬───────────────────┤
│  /api/*          │  /.well-known/   │  /*               │
│  Symfony (PHP)   │  mercure         │  Next.js (Node)   │
│  Backend API     │  Mercure SSE     │  Frontend         │
├──────────────────┴──────────────────┴───────────────────┤
│              PostgreSQL  │  RabbitMQ                    │
│              Database    │  Message queue               │
│                          │  (async workers)             │
└─────────────────────────────────────────────────────────┘
```

| Service | Technology | Role |
|---------|------------|------|
| **Backend** | Symfony 7.2 / PHP 8.3 | REST API, business logic, security |
| **Frontend** | Next.js 15 / React 19 | Single-page application UI |
| **Database** | PostgreSQL 16 | Data persistence |
| **Message broker** | RabbitMQ 3.13 | Asynchronous task execution |
| **Real-time** | Mercure | Server-Sent Events (SSE) |
| **Reverse proxy** | Nginx 1.26 | Routing, single entry point |

## Features

### Fleet management
- **Nodes**: network device inventory (IP, manufacturer, model, profile)
- **Tags**: color-coded labels for organizing and categorizing nodes
- **Manufacturers & Models**: device catalog with logos and connection scripts
- **Profiles**: credential groups (SSH/SNMP) for device access
- **Contexts**: multi-tenancy, each context isolates its own data

### Configuration collection
- **SSH connection** via phpseclib3 with per-model connection scripts and control character support
- **Collection commands**: folders and commands organized in a tree structure
- **Collection rules**: data extraction with regex, inventory mapping, and node field updates
- **Automatic and manual association** of commands and rules to device models
- **File-based storage**: each command produces a text file, organized by rule
- **Multiple tags** per collection with per-context uniqueness
- **Asynchronous execution** via dedicated RabbitMQ workers (scalable)

### Compliance
- **Compliance policies**: group rules and target nodes for evaluation
- **Compliance rules**: configurable checks with multiple data sources (inventory, collection, SSH)
- **Regex-based evaluation**: match, count, or capture modes with named groups and value mapping
- **Condition engine**: operators (equals, contains, matches, greater_than, etc.) with AND/OR logic blocks
- **Severity levels**: info, low, medium, high, critical — each with a weighted score
- **A-F grading**: automatic score calculation based on severity-weighted penalties (A >= 90%, B >= 75%, C >= 60%, D >= 45%, E >= 30%, F < 30%)
- **Error penalty**: rules that cannot be evaluated (errors) are penalized with maximum weight (critical)
- **Folder-based rule organization**: tree structure within policies, plus extra standalone rules
- **Asynchronous evaluation** via dedicated compliance workers (scalable)
- **Per-node compliance tab**: view all policy results and launch evaluations from node detail
- **Real-time progress** via Mercure SSE during evaluation
- **Visual result indicators**: color-coded icons (green = compliant, red = non-compliant, red striped = error, grey = not applicable) with interactive legend

### Monitoring
- **ICMP ping** with real-time status updates
- **Visual indicators** in the nodes table (collection status, reachability)

### Real-time
- **Mercure SSE** for instant updates (collection progress, ping results, compliance evaluation, admin tasks)

### Administration
- **User and context management**
- **Unified task board** (tasks + collections)
- **Health check** and system **logs**

### Interface
- **6 languages**: French, English, Spanish, German, Italian, Japanese
- **Dark mode** built-in
- **Responsive** with Tailwind CSS

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24.0
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.20

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Edit the `.env` file as needed. Default values work for local development:

```env
APP_ENV=dev

# Base URL (set to your server IP/domain if not localhost)
# DEFAULT_URI=http://localhost

# Exposed HTTP port (default: 80)
# HTTP_PORT=80

# PostgreSQL
POSTGRES_DB=auditix
POSTGRES_USER=auditix
POSTGRES_PASSWORD=auditix

# RabbitMQ
RABBITMQ_USER=auditix
RABBITMQ_PASSWORD=auditix
```

### 3. Start the application

```bash
make up
```

This command:
- Builds the Docker images
- Starts all services (database, message broker, backend, frontend, workers)
- Installs dependencies (`composer install`, `npm install`) on first launch
- Runs database migrations automatically
- Creates the default admin user (`admin` / `password`)

### 4. Access the application

Open `http://localhost` (or `http://<your-ip>:<HTTP_PORT>` if configured).

**Default credentials**: `admin` / `password`

## Environment modes

### Development (default)

```env
APP_ENV=dev
```

- Next.js runs in dev mode with hot reload (Turbopack)
- Symfony runs with debug toolbar and detailed error pages

### Production

```env
APP_ENV=prod
```

- Next.js is built and served as a static production build
- Symfony cache is warmed up with optimized autoloader
- Recommended for remote/server deployments

### Remote deployment

When deploying on a remote server with a public IP, configure:

```env
APP_ENV=prod
DEFAULT_URI=http://your-server-ip
HTTP_PORT=8080
```

## Useful commands

```bash
make up              # Start all services
make down            # Stop all services
make restart         # Restart all services
make build           # Rebuild Docker images
make logs            # Show logs for all services
make logs-php        # Show PHP logs
make logs-workers    # Show worker logs
make console         # Open a shell in the PHP container
make sf CMD="..."    # Run a Symfony command (e.g. make sf CMD="cache:clear")
make composer CMD="..." # Run a Composer command
```

## Project structure

```
auditix/
├── app/                          # Symfony backend
│   ├── config/                   # Symfony configuration
│   ├── migrations/               # Doctrine migrations
│   ├── src/
│   │   ├── Command/              # Console commands (scheduler, cleanup)
│   │   ├── Controller/Api/       # REST API controllers
│   │   ├── Entity/               # Doctrine entities (Node, Collection, Compliance*, etc.)
│   │   ├── Message/              # Async messages (Collect, Ping, EvaluateCompliance)
│   │   ├── MessageHandler/       # Worker handlers
│   │   ├── Repository/           # Doctrine repositories
│   │   ├── Security/             # Authentication
│   │   └── Service/              # Business services (ComplianceEvaluator)
│   └── composer.json
├── frontend/                     # Next.js frontend
│   ├── src/
│   │   ├── app/                  # Pages (App Router)
│   │   │   ├── (authenticated)/  # Protected pages
│   │   │   │   ├── nodes/        # Node management
│   │   │   │   ├── tags/         # Node tag management
│   │   │   │   ├── manufacturers/# Manufacturers
│   │   │   │   ├── models/       # Models
│   │   │   │   ├── profiles/     # Profiles
│   │   │   │   ├── collections/  # Collection history
│   │   │   │   ├── collection-commands/ # Collection commands
│   │   │   │   ├── collection-rules/    # Collection rules
│   │   │   │   ├── compliance/   # Compliance policies & rules
│   │   │   │   ├── reports/      # Reports
│   │   │   │   ├── settings/     # Settings
│   │   │   │   └── admin/        # Administration
│   │   │   └── login/            # Login page
│   │   ├── components/           # React components
│   │   └── i18n/                 # Translation files (6 languages)
│   └── package.json
├── docker/                       # Docker files
│   ├── nginx/default.conf        # Nginx configuration
│   ├── php/Dockerfile            # PHP 8.3 image + extensions
│   └── node/Dockerfile           # Node 22 image
├── data/                         # Docker volumes (git-ignored)
│   └── collections/              # Collection files (mounted in workers)
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Workers

The application uses several asynchronous workers via RabbitMQ:

| Worker | Transport | Replicas | Role |
|--------|-----------|----------|------|
| `worker-scheduler` | — | 1 | Monitoring scheduling |
| `worker-monitoring` | `monitoring` | 1 | ICMP ping execution |
| `worker-collector` | `collector` | 2 | SSH configuration collection |
| `worker-generator` | `generator` | 1 | Generation (reserved) |
| `worker-compliance` | `compliance` | 2 | Compliance rule evaluation |
| `worker-cleanup` | — | 1 | Task cleanup |

Worker replicas can be increased in `.env` to parallelize workloads:

```env
WORKER_COLLECTOR_REPLICAS=4
WORKER_COMPLIANCE_REPLICAS=4
```

## Collection workflow

```
1. User selects nodes and triggers a collection
2. Backend creates Collection entities and dispatches messages
3. Collector workers consume the messages:
   a. SSH connection to the device
   b. Run connection script (model-specific)
   c. Execute each collection command
   d. Store results as files (1 folder/rule, 1 file/command)
   e. Real-time progress updates via Mercure
4. User views results in the interface
```

## Compliance workflow

```
1. Admin creates compliance rules with data sources, regex patterns, and conditions
2. Admin creates a compliance policy, assigns rules (via folders or extra rules), and targets nodes
3. User triggers evaluation (from policy page or node detail page)
4. Backend dispatches one message per node to the compliance queue
5. Compliance workers evaluate each rule against the node:
   a. Fetch source data (inventory field, collection file, or live SSH command)
   b. Apply regex extraction (match/count/capture)
   c. Evaluate condition blocks (AND/OR logic with operators)
   d. Record result: compliant, non_compliant (with severity), error, or not_applicable
   e. Disabled rules are skipped and hidden from results
   f. Real-time progress updates via Mercure
6. Final score calculated as A-F grade based on severity-weighted penalties
   - Errors are penalized with maximum weight (critical = 10)
   - Not applicable rules are excluded from the score
7. Score displayed on node cards and in the compliance tab
```

## Tech stack

**Backend**: PHP 8.3, Symfony 7.2, Doctrine ORM, phpseclib3, Messenger + AMQP

**Frontend**: Node 22, Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 4

**Infrastructure**: Docker, Nginx, PostgreSQL 16, RabbitMQ 3.13, Mercure

## License

This project is licensed under the [MIT License](LICENSE).

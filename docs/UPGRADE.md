# Upgrade guide

This guide covers installing, upgrading and recovering an Auditix instance.

## Install

### One-line install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/tchevalleraud/auditix/main/scripts/install.sh | bash
```

The script will prompt for an install directory (default `/opt/auditix`),
clone the repository, copy `.env.example` to `.env` and run `make up`.

Override behavior with environment variables:

| Variable                 | Default                                            | Description                                  |
|--------------------------|----------------------------------------------------|----------------------------------------------|
| `AUDITIX_DIR`            | `/opt/auditix`                                     | Where to clone the repo                      |
| `AUDITIX_VERSION`        | latest tag                                         | Pin to a specific tag (e.g. `v4.3.0`)        |
| `AUDITIX_BRANCH`         | _unset_                                            | Use a branch instead of a tag (e.g. `main`)  |
| `AUDITIX_REPO`           | `https://github.com/tchevalleraud/auditix.git`     | Override repository URL                      |
| `AUDITIX_NONINTERACTIVE` | `0`                                                | When `1`, skip prompts and use defaults      |

Example, pinning the version and skipping the prompt:

```bash
AUDITIX_DIR=/srv/auditix AUDITIX_VERSION=v4.3.0 AUDITIX_NONINTERACTIVE=1 \
    bash -c 'curl -fsSL https://raw.githubusercontent.com/tchevalleraud/auditix/main/scripts/install.sh | bash'
```

### Manual install

```bash
git clone https://github.com/tchevalleraud/auditix.git
cd auditix
cp .env.example .env
make up
```

Both methods leave you with the same on-disk layout, so subsequent `make` targets
behave identically.

## Upgrade

### Default behavior

```bash
cd /path/to/auditix
make upgrade
```

- **On a branch** (`main`, `dev`, …): pulls the latest commits of that branch.
- **On a tag** (detached HEAD, the default after the one-line installer):
  jumps to the latest stable tag (e.g. v4.3.1 → v4.3.2).
- Override with `BRANCH=` or `TAG=` (see below).

`make upgrade` performs:

1. **Automatic backup** of database + uploads/reports/collections (see *Backup* below)
2. `git fetch --tags --prune origin`
3. `git pull --ff-only` (or `git checkout` when switching refs, see below)
4. Rebuild containers
5. `composer install` + `cache:clear` + `doctrine:migrations:migrate`
6. Restart workers
7. Restart nginx once the frontend is ready

To skip the backup step (faster, but no recovery point):

```bash
make upgrade SKIP_BACKUP=1
```

### Switch to another branch or tag

```bash
make upgrade BRANCH=dev          # follow the dev branch
make upgrade TAG=v4.3.0          # pin to a specific tag (detached HEAD)
make upgrade BRANCH=main         # come back to main
```

When the target ref differs from the current one, the safety backup is
labelled with the source branch (e.g. `backups/auditix-from-main-…tar.gz`),
which makes restore easier:

```bash
# go test the dev branch
make upgrade BRANCH=dev

# come back to a clean main state
make upgrade BRANCH=main
make restore BACKUP=backups/auditix-from-main-<timestamp>.tar.gz
```

> ⚠️ Doctrine does not auto-rollback migrations. Going from a more advanced
> branch (e.g. `dev`) back to an older one (`main`) leaves the schema with
> columns/tables that the older code doesn't know about — usually harmless,
> but `make doctor` will warn you about it. The clean recovery path is to
> restore the labelled backup taken when you left the older branch.

## Backup and restore

### Manual backup

```bash
make backup
```

Produces `backups/auditix-YYYYMMDD-HHMMSS.tar.gz` containing:

- A gzipped Postgres SQL dump (`db.sql.gz`)
- The uploads, reports and collections directories
- A `VERSION` marker matching the running release

### Restore

```bash
make restore BACKUP=backups/auditix-20260505-093000.tar.gz
```

The target stops application services, drops & recreates the database, replays
the dump, restores files and restarts everything. You will be prompted to type
`yes` before any destructive action.

## Diagnostics

```bash
make doctor       # Read-only diagnostic
make doctor-fix   # Apply auto-fixes for unambiguous safe issues
```

`doctor` checks:

1. Container health (running / healthy)
2. Postgres data permissions (catches `pg_filenode.map: Permission denied`)
3. Schema bootstrap (the `node` table exists)
4. Migration history (recorded vs migrations on disk)
5. HTTP availability

When an issue can be auto-fixed safely (typically a stale cache or a
populated schema with empty `doctrine_migration_versions` while the entity
mapping matches the schema), `make doctor-fix` will apply the fix. Issues that
require host-level access (e.g. `chown` on the postgres data dir) are reported
with the exact commands to run.

## Troubleshooting older installs

### Symptom: `relation "node" does not exist` during migrate

Cause: the migration history starts at an `ALTER TABLE node` and the database
is empty.

Fix (since v4.3.0): the PHP entrypoint detects an empty schema and bootstraps
it from the entity mapping before migrations run.

If you are stuck on an older release that does not include this entrypoint,
manually:

```bash
docker compose exec php php bin/console doctrine:schema:create --no-interaction
docker compose exec php php bin/console doctrine:migrations:sync-metadata-storage --no-interaction
docker compose exec php php bin/console doctrine:migrations:version --add --all --no-interaction
```

Then re-run `make upgrade`.

### Symptom: `FATAL: could not open file "global/pg_filenode.map": Permission denied`

Cause: the `data/postgres/` directory on the host has wrong ownership for the
postgres user inside the container (UID 70 on the alpine image).

Fix:

```bash
docker compose down
sudo chown -R 70:70 data/postgres
sudo chmod -R u=rwX,go= data/postgres
docker compose up -d
```

If you don't know what changed, restoring from a backup is the safe path:

```bash
make restore BACKUP=backups/auditix-<timestamp>.tar.gz
```

### Symptom: `doctrine_migration_versions` is empty but tables exist

Cause: an old version of the entrypoint silently fell back to
`doctrine:schema:update --force` when migrations failed, which left the
migration table empty.

Auto-fix: `make doctor-fix` will detect this and, when the schema matches the
current entity mapping, mark every existing migration as applied.

Manual fix:

```bash
docker compose exec php php bin/console doctrine:migrations:version --add --all --no-interaction
```

Then run `make upgrade` so any new migrations introduced by your target version
are applied.

## Version compatibility

| From    | To       | Path                                                                                                       |
|---------|----------|------------------------------------------------------------------------------------------------------------|
| 4.0.x   | 4.3.0    | `make upgrade` then `make doctor-fix`                                                                      |
| 4.1.x   | 4.3.0    | `make upgrade`                                                                                             |
| 4.2.x   | 4.3.0    | `make upgrade`                                                                                             |
| < 4.0   | _any_    | Not directly supported — backup, install fresh, restore data manually                                      |

For installs that fell into the corrupted-history state described above,
`make doctor-fix` is the recommended remediation before running `make upgrade`.

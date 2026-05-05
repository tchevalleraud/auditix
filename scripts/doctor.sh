#!/usr/bin/env bash
#
# Auditix doctor — diagnose common issues and (when safe) auto-fix them.
#
# Usage:
#   ./scripts/doctor.sh           Diagnostic only.
#   ./scripts/doctor.sh --fix     Apply auto-fixes for unambiguous safe issues.
#   AUTOFIX=1 ./scripts/doctor.sh Same as --fix.
#
set -uo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BOLD='\033[1m'
NC='\033[0m'

AUTOFIX="${AUTOFIX:-0}"
[ "${1:-}" = "--fix" ] && AUTOFIX=1

ISSUES=0
FIXED=0

ok()      { printf "  ${GREEN}✓${NC} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}!${NC} %s\n" "$*"; ISSUES=$((ISSUES+1)); }
fail()    { printf "  ${RED}✗${NC} %s\n" "$*"; ISSUES=$((ISSUES+1)); }
hint()    { printf "    ${CYAN}→${NC} %s\n" "$*"; }
fixed()   { printf "  ${GREEN}⚡${NC} %s\n" "$*"; FIXED=$((FIXED+1)); }
section() { printf "\n${BOLD}${CYAN}%s${NC}\n" "$*"; }

dc()      { docker compose "$@"; }
dcph()    { docker compose exec -T php "$@"; }
dcpg()    { docker compose exec -T postgres "$@"; }

# --- 1. Containers ---
section "[1/5] Container health"
PS_OUT="$(dc ps --format '{{.Service}}|{{.State}}|{{.Status}}' 2>/dev/null || true)"
if [ -z "$PS_OUT" ]; then
    fail "No services found. Run 'make up' first."
    echo
    exit 1
fi
while IFS='|' read -r svc state status; do
    [ -z "$svc" ] && continue
    case "$state" in
        running)
            case "$status" in
                *"(unhealthy)"*) fail "$svc — running but unhealthy ($status)" ;;
                *)               ok   "$svc — $status" ;;
            esac
            ;;
        *) fail "$svc — $state ($status)" ;;
    esac
done <<< "$PS_OUT"

# --- 2. Postgres data permissions ---
section "[2/5] Postgres data permissions"
if dcpg test -r /var/lib/postgresql/data/global/pg_filenode.map 2>/dev/null; then
    ok "Postgres can read its data files"
else
    fail "Postgres cannot read 'global/pg_filenode.map' (Permission denied)"
    hint "Fix on the host (requires sudo):"
    hint "  docker compose down"
    hint "  sudo chown -R 70:70 data/postgres"
    hint "  sudo chmod -R u=rwX,go= data/postgres"
    hint "  docker compose up -d"
    hint "(70 is the postgres UID inside the alpine image)"
fi

# --- 3. Schema bootstrap ---
section "[3/5] Database schema"
SCHEMA_OK=0
if dcph php bin/console doctrine:query:sql "SELECT 1 FROM node LIMIT 1" >/dev/null 2>&1; then
    ok "Schema present (table 'node' exists)"
    SCHEMA_OK=1
else
    fail "Schema not bootstrapped — table 'node' missing"
    if [ "$AUTOFIX" = "1" ]; then
        hint "Restarting php container so the entrypoint bootstraps the schema..."
        dc restart php >/dev/null 2>&1 || true
        sleep 5
        if dcph php bin/console doctrine:query:sql "SELECT 1 FROM node LIMIT 1" >/dev/null 2>&1; then
            fixed "Schema bootstrapped via entrypoint"
            SCHEMA_OK=1
        else
            hint "Auto-fix failed. Check 'docker compose logs php' for errors."
        fi
    else
        hint "Re-run with --fix, or: docker compose restart php"
    fi
fi

# --- 4. Migration history ---
section "[4/5] Migration history"
if [ "$SCHEMA_OK" = "1" ]; then
    MIGS_DB="$(dcph php bin/console doctrine:query:sql "SELECT COUNT(*) AS c FROM doctrine_migration_versions" 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
    MIGS_FS="$(ls -1 app/migrations/Version*.php 2>/dev/null | wc -l | tr -d ' ')"

    if [ -z "${MIGS_DB:-}" ]; then
        warn "doctrine_migration_versions table not found"
        hint "Bootstrap: docker compose exec php php bin/console doctrine:migrations:sync-metadata-storage --no-interaction"
    elif [ "$MIGS_DB" = "0" ] && [ "$MIGS_FS" -gt 0 ]; then
        fail "Migration history empty but schema is populated ($MIGS_FS migrations on disk)"
        hint "This usually means an old install used 'schema:update --force' as fallback."
        if [ "$AUTOFIX" = "1" ]; then
            if dcph php bin/console doctrine:schema:validate --skip-sync >/dev/null 2>&1; then
                hint "Schema matches mapping — marking all migrations as applied..."
                dcph php bin/console doctrine:migrations:version --add --all --no-interaction >/dev/null 2>&1 \
                    && fixed "Marked $MIGS_FS migrations as applied" \
                    || hint "Auto-fix failed; run the command manually."
            else
                hint "Schema does NOT match current entity mapping — auto-fix unsafe."
                hint "Manual steps:"
                hint "  1. make backup"
                hint "  2. docker compose exec php php bin/console doctrine:migrations:version --add --all --no-interaction"
                hint "  3. make upgrade"
            fi
        else
            hint "Re-run with --fix to mark all as applied (only safe if schema is in sync)."
        fi
    elif [ "$MIGS_DB" -lt "$MIGS_FS" ]; then
        PENDING=$((MIGS_FS - MIGS_DB))
        warn "$PENDING pending migration(s)"
        hint "Apply: make upgrade   (or: docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction)"
    elif [ "$MIGS_DB" -gt "$MIGS_FS" ]; then
        EXTRA=$((MIGS_DB - MIGS_FS))
        warn "Database has $EXTRA migration(s) not present in this checkout"
        hint "This usually means you switched to an older branch/tag while the DB was upgraded by a newer one."
        hint "The schema may carry columns/tables the current code does not know about — usually harmless"
        hint "as long as no NOT NULL or FK conflict exists."
        hint "To get back to a coherent state with the previous branch:"
        hint "  make restore BACKUP=backups/auditix-from-<source-branch>-*.tar.gz"
    else
        ok "All $MIGS_DB migrations recorded as applied"
    fi
else
    warn "Skipped — schema bootstrap failed"
fi

# --- 5. HTTP endpoint ---
section "[5/5] HTTP endpoint"
PORT="$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2)"
PORT="${PORT:-80}"
CODE="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT" 2>/dev/null || echo "000")"
case "$CODE" in
    2*|301|302|307|308) ok "http://localhost:$PORT → $CODE" ;;
    *)                  fail "http://localhost:$PORT → $CODE (frontend may still be compiling)" ;;
esac

# --- Summary ---
echo
if [ "$ISSUES" = "0" ]; then
    printf "${GREEN}${BOLD}All checks passed.${NC}\n"
    exit 0
fi
printf "${YELLOW}${BOLD}%d issue(s) detected" "$ISSUES"
[ "$FIXED" -gt 0 ] && printf ", %d auto-fixed" "$FIXED"
printf ".${NC}\n"
[ "$AUTOFIX" = "1" ] || printf "${CYAN}Re-run with --fix to apply auto-fixes where safe.${NC}\n"
exit 1

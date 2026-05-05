#!/usr/bin/env bash
#
# Auditix one-shot installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tchevalleraud/auditix/main/scripts/install.sh | bash
#
# Environment overrides (optional):
#   AUDITIX_DIR=/opt/auditix       Install directory (otherwise prompted)
#   AUDITIX_VERSION=v4.3.0         Tag to install (default: latest release)
#   AUDITIX_BRANCH=main            Branch to install (overrides VERSION when set)
#   AUDITIX_REPO=<git url>         Override repo URL (default: official)
#   AUDITIX_NONINTERACTIVE=1       Don't prompt; use defaults / env vars
#
set -euo pipefail

REPO_URL="${AUDITIX_REPO:-https://github.com/tchevalleraud/auditix.git}"
DEFAULT_DIR="/opt/auditix"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
die()   { red "$*"; exit 1; }

is_tty() { [ -t 0 ] && [ -t 1 ] && [ "${AUDITIX_NONINTERACTIVE:-0}" != "1" ]; }

# --- Prerequisites ---
cyan "==> Checking prerequisites..."
command -v git >/dev/null 2>&1 || die "git is required"
command -v docker >/dev/null 2>&1 || die "docker is required"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is required (try: docker compose version)"
command -v make >/dev/null 2>&1 || die "make is required"

# --- Resolve install directory ---
if [ -n "${AUDITIX_DIR:-}" ]; then
    TARGET="$AUDITIX_DIR"
elif is_tty; then
    printf "Install directory [%s]: " "$DEFAULT_DIR"
    read -r reply </dev/tty
    TARGET="${reply:-$DEFAULT_DIR}"
else
    TARGET="$DEFAULT_DIR"
fi

# Make absolute
case "$TARGET" in
    /*) ;;
    ~*) TARGET="${TARGET/#\~/$HOME}" ;;
    *)  TARGET="$(pwd)/$TARGET" ;;
esac

# --- Resolve ref to install ---
REF=""
if [ -n "${AUDITIX_BRANCH:-}" ]; then
    REF="$AUDITIX_BRANCH"
elif [ -n "${AUDITIX_VERSION:-}" ]; then
    REF="$AUDITIX_VERSION"
fi

if [ -z "$REF" ]; then
    cyan "==> Discovering latest release..."
    REF="$(git ls-remote --tags --refs "$REPO_URL" 2>/dev/null \
        | awk -F/ '{print $NF}' \
        | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
        | sort -V \
        | tail -n 1 || true)"
    REF="${REF:-main}"
fi

cyan "==> Installing Auditix $REF into $TARGET"

# --- Clone or update ---
if [ -d "$TARGET/.git" ]; then
    cyan "==> Existing checkout found, fetching $REF..."
    git -C "$TARGET" fetch --tags --prune origin
    git -C "$TARGET" checkout "$REF"
else
    if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
        die "$TARGET exists and is not empty"
    fi
    mkdir -p "$TARGET"
    git clone "$REPO_URL" "$TARGET"
    git -C "$TARGET" checkout "$REF"
fi

# --- Bootstrap .env ---
if [ ! -f "$TARGET/.env" ]; then
    cp "$TARGET/.env.example" "$TARGET/.env"
    cyan "==> .env created from example (review it before exposing the service)"
else
    yellow "==> .env already exists, leaving it untouched"
fi

# --- Launch ---
cyan "==> Starting services (this may take a few minutes on first run)..."
make -C "$TARGET" up

PORT="$(grep -E '^HTTP_PORT=' "$TARGET/.env" 2>/dev/null | cut -d= -f2)"
PORT="${PORT:-80}"

green ""
green "=========================================="
green " Auditix is up and running"
green "=========================================="
green " URL       : http://localhost:$PORT"
green " Directory : $TARGET"
green " Version   : $REF"
green ""
green " Default credentials: admin / password"
green ""
green " Manage with: cd $TARGET && make help"
green "=========================================="

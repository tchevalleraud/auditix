#!/bin/sh
set -e

if [ ! -d /app/node_modules ]; then
    echo ">> Installing dependencies..."
    npm install
fi

exec "$@"

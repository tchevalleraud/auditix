#!/bin/sh
set -e

# Only run npm install when dependencies actually changed. Running it on every
# start touches package-lock.json (even when content is unchanged), and Next.js
# dev watches that file: any mtime bump makes it gracefully exit, which Docker
# treats as a clean exit and restarts the container — producing an endless
# restart loop until the user notices the UI stuck on "Update in progress".
STAMP=node_modules/.install-stamp
if [ ! -d node_modules ] \
    || [ ! -f "$STAMP" ] \
    || [ package.json -nt "$STAMP" ] \
    || [ package-lock.json -nt "$STAMP" ]; then
    echo ">> Installing/updating dependencies..."
    npm install
    mkdir -p node_modules
    touch "$STAMP"
else
    echo ">> Dependencies up to date, skipping npm install."
fi

if [ "$APP_ENV" = "prod" ]; then
    echo ">> Building Next.js for production..."
    npm run build
    echo ">> Starting production server..."
    exec npm start
else
    exec "$@"
fi

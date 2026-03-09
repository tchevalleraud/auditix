#!/bin/sh
set -e

if [ ! -d /app/node_modules ]; then
    echo ">> Installing dependencies..."
    npm install
fi

if [ "$APP_ENV" = "prod" ]; then
    echo ">> Building Next.js for production..."
    npm run build
    echo ">> Starting production server..."
    exec npm start
else
    exec "$@"
fi

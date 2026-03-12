#!/bin/sh
set -e

echo ">> Installing/updating dependencies..."
npm install

if [ "$APP_ENV" = "prod" ]; then
    echo ">> Building Next.js for production..."
    npm run build
    echo ">> Starting production server..."
    exec npm start
else
    exec "$@"
fi

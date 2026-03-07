#!/bin/bash
set -e

echo ">> Waiting for application to be ready..."
until [ -f /var/www/.ready ]; do
    sleep 2
done

echo ">> Application ready, starting worker."
exec "$@"

#!/bin/bash
set -e

# Install Symfony skeleton if no project exists (first-ever run)
if [ ! -f /var/www/composer.json ]; then
    echo ">> Installing Symfony project..."
    composer create-project symfony/skeleton:"7.2.*" /tmp/symfony --no-interaction
    cp -a /tmp/symfony/. /var/www/
    rm -rf /tmp/symfony

    composer config audit.block-insecure false
    composer require webapp --no-interaction
    composer require symfony/messenger symfony/amqp-messenger --no-interaction
fi

# Always install dependencies if vendor is missing
if [ -f /var/www/composer.json ] && [ ! -d /var/www/vendor ]; then
    echo ">> Installing dependencies..."
    composer install --no-interaction --optimize-autoloader
fi

if [ -f /var/www/bin/console ]; then
    echo ">> Waiting for database..."
    until php bin/console doctrine:query:sql "SELECT 1" > /dev/null 2>&1; do
        sleep 2
    done

    echo ">> Running database migrations..."
    php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration 2>/dev/null || {
        echo ">> Migrations failed, falling back to schema update..."
        php bin/console doctrine:schema:update --force --no-interaction
    }

    echo ">> Creating default user..."
    php bin/console app:create-default-user
fi

# Allow www-data to access Docker socket for health checks
if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock 2>/dev/null)
    if [ -n "$DOCKER_GID" ]; then
        getent group "$DOCKER_GID" >/dev/null 2>&1 || groupadd -g "$DOCKER_GID" docker
        usermod -aG "$DOCKER_GID" www-data 2>/dev/null || true
    fi
fi

touch /var/www/.ready
echo ">> Application ready."

exec "$@"

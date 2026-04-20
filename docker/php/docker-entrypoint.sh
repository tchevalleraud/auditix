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

# Ensure Symfony .env exists (required by composer post-install scripts)
if [ -f /var/www/composer.json ] && [ ! -f /var/www/.env ]; then
    echo ">> Creating .env file..."
    cat > /var/www/.env <<'ENVEOF'
APP_ENV=dev
APP_SECRET=
DEFAULT_URI=http://localhost
DATABASE_URL="postgresql://auditix:auditix@postgres:5432/auditix?serverVersion=16&charset=utf8"
MESSENGER_TRANSPORT_DSN=doctrine://default?auto_setup=0
MERCURE_URL=http://mercure/.well-known/mercure
MERCURE_PUBLIC_URL=/.well-known/mercure
MERCURE_JWT_SECRET="!ChangeThisMercureHubJWTSecretKey!"
ENVEOF
fi

# Install dependencies if vendor is missing or composer.lock is newer than installed state
if [ -f /var/www/composer.json ]; then
    if [ ! -d /var/www/vendor ] || [ /var/www/composer.lock -nt /var/www/vendor/composer/installed.json ]; then
        echo ">> Installing/updating dependencies..."
        composer install --no-interaction --optimize-autoloader
    fi
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

    echo ">> Warming up cache..."
    php bin/console cache:warmup --no-interaction 2>/dev/null || true

    echo ">> Fixing permissions..."
    chown -R www-data:www-data /var/www/var 2>/dev/null || true
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

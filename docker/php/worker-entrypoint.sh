#!/bin/bash
set -e

echo ">> Waiting for application to be ready..."
until [ -f /var/www/.ready ]; do
    sleep 2
done

echo ">> Waiting for RabbitMQ connection..."
until php -r "
    \$dsn = getenv('MESSENGER_TRANSPORT_DSN');
    if (!preg_match('#amqp://([^:]+):([^@]+)@([^:]+):(\d+)#', \$dsn, \$m)) exit(1);
    \$sock = @fsockopen(\$m[3], (int)\$m[4], \$errno, \$errstr, 3);
    if (!\$sock) exit(1);
    fclose(\$sock);
" 2>/dev/null; do
    sleep 3
done

echo ">> Application ready, starting worker as www-data."
exec gosu www-data "$@"

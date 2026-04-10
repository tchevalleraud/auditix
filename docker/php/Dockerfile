FROM php:8.3-fpm-bookworm

RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libpq-dev \
    libzip-dev \
    libicu-dev \
    libssh2-1-dev \
    librabbitmq-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    openssh-client \
    iputils-ping \
    snmp \
    librsvg2-bin \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install \
    pdo_pgsql \
    pgsql \
    zip \
    intl \
    opcache \
    sockets \
    gd \
    && pecl install amqp \
    && docker-php-ext-enable amqp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY worker-entrypoint.sh /usr/local/bin/worker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/worker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]

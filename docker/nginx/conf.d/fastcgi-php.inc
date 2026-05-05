location ~ ^/index\.php(/|$) {
    root /var/www/public;
    # Use a variable so nginx re-resolves php's IP via the docker resolver.
    # A static upstream {} block caches the IP at boot, breaking after any php restart.
    set $upstream_php php:9000;
    fastcgi_pass $upstream_php;
    fastcgi_split_path_info ^(.+\.php)(/.*)$;
    fastcgi_read_timeout 1800s;
    fastcgi_send_timeout 1800s;
    fastcgi_request_buffering off;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME /var/www/public$fastcgi_script_name;
    fastcgi_param DOCUMENT_ROOT /var/www/public;
    # Forward client IP info so Symfony (with trusted_proxies) resolves the real IP.
    fastcgi_param HTTP_X_FORWARDED_FOR $proxy_add_x_forwarded_for;
    fastcgi_param HTTP_X_FORWARDED_PROTO $scheme;
    fastcgi_param HTTP_X_FORWARDED_HOST $host;
    fastcgi_param HTTP_X_REAL_IP $remote_addr;
    internal;
}

location ~ \.php$ {
    return 404;
}

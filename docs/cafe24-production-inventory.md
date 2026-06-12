# Cafe24 Production Inventory

Last verified: 2026-06-12 KST.

This is the canonical deployment map for the Cafe24 VPS that serves both Swing Enjoy and the Rhythmjoy calendar. The matching machine-readable file is:

```text
deploy/cafe24/production-target.env
```

Do not keep passwords, DB passwords, private keys, API tokens, or certificate private keys in this document.

## Shared VPS

- Provider: Cafe24 single VPS
- Hostname: `clown313python.cafe24.com`
- IPv4: `1.234.23.64`
- SSH target: `root@1.234.23.64`
- SSH key on this Mac: `~/.ssh/swingenjoy_cafe24_ed25519`
- OS: CentOS Linux 7
- Web server: Apache/httpd
- Apache config directory: `/etc/httpd/conf.d`
- Enabled shared services: `httpd.service`, `mariadb.service`

Verification evidence:

- `swingenjoy.com` resolves to `1.234.23.64`.
- `리듬앤조이일정표.com` resolves as `xn--xy1b23ggrmm5bfb82ees967e.com` to `1.234.23.64`.
- SSH to `root@swingenjoy.com` reports hostname `clown313python.cafe24.com` and IP `1.234.23.64`.
- Apache `httpd -S` lists both `swingenjoy.com` and `xn--xy1b23ggrmm5bfb82ees967e.com` as vhosts on this server.

Important non-target:

- `rhythmandjoy.cafe24.com` currently resolves to `210.114.6.137`, not this VPS. Treat it as old or separate hosting unless it is explicitly revalidated.

## Swing Enjoy

- Public domain: `swingenjoy.com`
- WWW alias: `www.swingenjoy.com`
- Local repo: `/Users/inteyeo/Rhythmjoy2025555-5`
- Server app directory: `/opt/swingenjoy`
- systemd service: `swingenjoy.service`
- Node internal port: `127.0.0.1:3001`
- Health check: `http://127.0.0.1:3001/__health`
- Apache HTTP vhost: `/etc/httpd/conf.d/swingenjoy-http.conf`
- Apache HTTPS vhost: `/etc/httpd/conf.d/swingenjoy-http-le-ssl.conf`
- Runtime env file on server: `/opt/swingenjoy/.env`
- Uploads directory: `/opt/swingenjoy/uploads`
- Deploy command from local repo: `npm run deploy:cafe24`

Apache routes this domain through a proxy:

```text
swingenjoy.com -> Apache :443 -> http://127.0.0.1:3001/ -> /opt/swingenjoy
```

Only the Swing Enjoy deploy script may write to `/opt/swingenjoy`. It must not write to `/home/clown313python/myapp`.

## Rhythmjoy Calendar

- Public domain: `리듬앤조이일정표.com`
- Punycode domain: `xn--xy1b23ggrmm5bfb82ees967e.com`
- WWW alias: `www.xn--xy1b23ggrmm5bfb82ees967e.com`
- Local repo: `/Users/inteyeo/Rhythmjoy_calendar`
- Server web root: `/home/clown313python/myapp`
- Ops directory: `/home/clown313python/rhythmjoy_ops`
- Main entrypoint: `/calendar_set/calendar_v10/calendar_10.html`
- Calendar cache service: `rhythmjoy-calendar-cache.service`
- Legacy email service: `my_email_service.service`
- Apache HTTP vhost: `/etc/httpd/conf.d/rhythmjoy-domain-http.conf`
- Apache HTTPS vhost: `/etc/httpd/conf.d/rhythmjoy-domain-ssl.conf`
- Runtime env file on server: `/home/clown313python/myapp/.env`
- Restore helper in local repo: `/Users/inteyeo/Rhythmjoy_calendar/ops/restore-cafe24.sh`

Apache serves this domain as static files:

```text
리듬앤조이일정표.com -> Apache :443 -> /home/clown313python/myapp/calendar_set/calendar_v10/calendar_10.html
```

Do not use the Swing Enjoy deploy script for this project.

## Current Apache Separation

- `swingenjoy.com` is a reverse proxy to the Node process on `127.0.0.1:3001`.
- `리듬앤조이일정표.com` is a static Apache document root under `/home/clown313python/myapp`.
- Both share Apache and MariaDB on the same VPS.
- A separate `libraryenjoy.com` vhost was also observed in Apache, but it is outside this two-project deployment map.

## Safe Deployment Rules

- Canonical SSH target is `root@1.234.23.64`; project domains are not the source of truth for SSH.
- Before deploying, verify the remote hostname is `clown313python.cafe24.com`.
- Swing Enjoy deploys only to `/opt/swingenjoy` and restarts only `swingenjoy.service`.
- Rhythmjoy calendar deploy/restore writes only to `/home/clown313python/myapp` and `/home/clown313python/rhythmjoy_ops`.
- Never copy secrets between the two app roots.
- Never put server secrets into Git.

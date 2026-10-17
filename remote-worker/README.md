# Docker-backed remote application worker

This optional service implements the remote-session API consumed by EVERYTHING-. It launches **only administrator-configured container images** and gives each session a separate bearer URL on a wildcard HTTPS subdomain.

## Important security boundary

The worker invokes the Docker CLI. Access to a Docker daemon is effectively host-level privilege. Run it on a dedicated, patched machine with only trusted images, do not expose its API port directly, do not mount host directories into app containers, and keep the worker bearer token private. This is not a multi-tenant hostile-code sandbox.

Sessions are ephemeral. Containers are removed on close, idle timeout, absolute timeout, or worker shutdown; files inside a session may be lost. Users must download/export their work before closing a session. No user volume or account isolation is implemented.

## Requirements

- Node.js 22.12 or newer.
- Docker Engine running on the worker host.
- A reverse proxy with HTTPS and WebSocket support.
- DNS for `runtime.example.com` and a wildcard `*.sessions.example.com`.
- A TLS certificate for the API hostname and a wildcard certificate for the session hostname.

Pre-pull the approved images before launching the worker. This avoids image-pull timeouts during session creation.

## Configuration

Add the following to a protected environment file on the worker host. Generate a new token with `openssl rand -hex 32` and replace every example value.

```env
WORKER_TOKEN=replace-with-a-random-64-character-hex-token
WORKER_HOST=127.0.0.1
WORKER_PORT=8788
WORKER_PUBLIC_BASE_URL=https://runtime.example.com/
WORKER_SESSION_BASE_URL=https://sessions.example.com/
WORKER_MAX_SESSIONS=2
WORKER_SESSION_TTL_MINUTES=60
WORKER_IDLE_TIMEOUT_MINUTES=15
WORKER_APPS_JSON='[{"id":"linux-desktop","name":"Linux Desktop","description":"A remote Linux desktop; installed programs depend on this image.","image":"lscr.io/linuxserver/webtop:ubuntu-xfce","port":3000,"memory":"2g","cpus":1,"pids":256,"capabilities":["CHOWN","DAC_OVERRIDE","FOWNER","FSETID","KILL","SETGID","SETUID","SETPCAP","NET_BIND_SERVICE","SYS_CHROOT","MKNOD","AUDIT_WRITE"],"env":{"PUID":"1000","PGID":"1000","TZ":"Etc/UTC","CUSTOM_USER":"desktop","PASSWORD":"replace-with-a-strong-container-password"}}]'
```

Use a custom, pinned image if you need Blender, LibreOffice, development tools, or other desktop applications preinstalled. Do not assume every program is present in the example image. App IDs, image names, ports, resource limits, environment variables, and the restricted Linux capabilities are administrator-controlled; API callers can only request an advertised app ID.

Start the worker:

```sh
node --env-file-if-exists=.env remote-worker/server.mjs
```

The worker listens on loopback by default. It removes old containers carrying its managed label at startup, so run only one instance per dedicated Docker daemon.

## Connect the workspace

On the main EVERYTHING- server, set:

```env
REMOTE_RUNTIME_URL=https://runtime.example.com/
REMOTE_RUNTIME_TOKEN=the-same-token-as-WORKER_TOKEN
```

Restart the main workspace. The remote app panel will list only IDs returned by `GET /v1/capabilities`. Session creation and closing use the worker's `POST /v1/sessions` and `DELETE /v1/sessions/{id}` endpoints.

If both Node services run directly on the same host, the main workspace can use `REMOTE_RUNTIME_URL=http://127.0.0.1:8788/` while the worker's `WORKER_PUBLIC_BASE_URL` is set to that same loopback URL. If the main workspace is inside another container, its `127.0.0.1` is not the host; use a private HTTPS endpoint or the HTTPS API hostname.

## Nginx reverse proxy example

Define this `map` in the Nginx `http` context:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Use one HTTPS virtual host for the API and another for session subdomains. Replace certificate paths and hostnames with your own:

```nginx
server {
    listen 443 ssl;
    server_name runtime.example.com;
    ssl_certificate /etc/letsencrypt/live/runtime.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/runtime.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}

server {
    listen 443 ssl;
    server_name *.sessions.example.com;
    access_log off;
    ssl_certificate /etc/letsencrypt/live/sessions.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sessions.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}
```

The session URL contains a short-lived bearer token in its hostname. Session-host access logging is disabled in this example to avoid recording that token. The worker also sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on proxied responses.

## Worker safeguards and limitations

- Bearer authentication on the worker API.
- Explicit image allowlist; no API parameter accepts arbitrary image names or commands.
- Container CPU, memory, PID, and concurrent-session limits.
- Containers publish their application port only on host loopback.
- Drops all Linux capabilities by default; only a small explicit allowlist can be added per app.
- HTTPS is required for non-local API and all session-viewer hosts.
- Sessions have an absolute TTL and an idle timeout.
- WebSocket upgrades are proxied for browser-based desktop apps.
- No persistence, per-user isolation, file recovery, GPU passthrough, or automatic model downloads. Those require separate deployment and storage decisions.

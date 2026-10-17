# Local container deployment

This deployment runs the lightweight workspace server in a non-root container. It does **not** bundle desktop applications, LLM weights, or a remote compute worker.

## Requirements

- Docker Engine and Docker Compose plugin.
- The repository checked out locally.
- A copy of the environment template.

## Start

```sh
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 everything
```

Open `http://127.0.0.1:8787`. The published port is explicitly bound to loopback, so it is not intended to be reachable from other machines. The container listens on its internal interface, but the host port mapping is loopback-only.

## Stop and update

```sh
docker compose down
git pull
docker compose up --build -d
```

## Resource and security defaults

- Node.js Alpine image; no npm runtime dependencies are installed.
- Runs as the built-in unprivileged `node` user.
- Read-only root filesystem, a small temporary filesystem, no added Linux capabilities, no-new-privileges, process limit, and bounded CPU/memory.
- Health checks use the service's local health endpoint.
- `.env` is excluded from the image build context. Keep provider keys only in the local environment file and never commit it.
- The port is bound to `127.0.0.1` on the host.

Do not change the port mapping to `0.0.0.0:8787:8787` or deploy this container publicly. The current application does not provide production multi-user authentication or production-grade authorization. For cloud deployment, first implement and review authentication, TLS, per-user secrets, durable abuse controls, monitoring, and an isolated remote worker.

## AI provider caveat

The container is only the workspace/API gateway. It does not download or run LLM weights. Cloud providers can be configured with server-side credentials in `.env`. A local model server must be reachable from inside the container through a supported, secure endpoint; `127.0.0.1` inside the container refers to the container itself, not the host.

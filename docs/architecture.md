# Architecture

## Current request flow

- Browser -> local Node.js server -> app registry.
- Browser -> AI gateway -> configured OpenAI-compatible API; provider keys remain server-side.
- Browser -> MCP gateway -> one configured MCP Streamable HTTP server; tool calls require explicit confirmation.
- Browser -> remote session adapter -> one configured remote runtime provider; only provider-advertised app IDs can launch.

## Trust boundaries

- The default bind address is loopback.
- By default, requests are restricted to loopback hosts. Public hostnames are accepted only when a shared password, Secure cookies, a trusted hostname, and HTTPS proxy metadata are configured.
- An optional shared-password gate protects API routes with in-memory 12-hour sessions; this is not multi-user identity or role-based authorization.
- AI, MCP and remote runtime endpoints are optional and require server-side configuration.
- MCP tools may have side effects. Confirmation UI helps prevent accidental calls but is not a substitute for authentication or per-user authorization.
- The remote adapter does not sandbox programs. The configured remote provider must implement isolation and resource quotas.
- Local inference is an optional compatible endpoint; model weights are not bundled or downloaded.

## Missing before production

Multi-user identity and user isolation, durable rate limiting, per-user provider secrets, audit logs, remote-worker deployment, persistent session storage, production proxy hardening, monitoring, backups, and a full security review.

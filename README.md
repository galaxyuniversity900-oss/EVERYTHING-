# EVERYTHING-

**A lightweight web workspace for browser-based tools, with opt-in AI, MCP, and remote-session adapters.**

The long-term goal is to make useful software accessible on modest devices without requiring every large desktop installation. The current project is an early but working foundation—not the finished platform.

## Implemented in this branch

- Dependency-free Node.js HTTP server and responsive app directory.
- 50 application entries sourced from the upstream Everything project: 22 published demo links and 28 source-only entries where the upstream README does not verify a hosted demo.
- Searchable catalog and health API.
- Device-local favorites and recently opened apps, plus a persistent compact layout for lower-end devices.
- Installable PWA shell with versioned offline caching; API responses for AI, MCP, and remote sessions are never cached.
- Browser-local notes, reusable prompts, and text snippets stored in IndexedDB, with search, edit/delete, JSON import/export, and a deliberate handoff into AI input. Local items are not synced or uploaded automatically.
- Opt-in OpenAI-compatible chat endpoint. Compatible localhost inference servers can be used without a key; cloud providers require a server-side key.
- Browser capability assessment for WASM/WebGPU plus approximate device-memory, CPU, and network constraints to recommend browser-native versus configured remote execution.
- Configured MCP Streamable HTTP client with tool discovery and explicit confirmation before tool calls.
- Remote runtime provider adapter with supported-app discovery, session creation, session closing, and server-side bearer token support.
- Automated tests and GitHub Actions HTTP smoke tests, including a lightweight source-asset budget check.
- Configuration, security, architecture, and remote provider API documentation.

## Low-resource behavior

The workspace checks browser-reported device memory (when available), logical CPU count, WebGPU exposure, network type, and data-saver preference. These are approximate signals, not benchmarks. Constrained devices are advised to avoid large local LLMs and parallel workloads; a configured remote worker is preferred only when available. If no worker is configured, the app recommends lightweight browser tools and a configured AI API. No model weights are downloaded automatically.

## Catalog provenance and limits

The catalog is curated from the upstream [HeyPuter/everything repository](https://github.com/HeyPuter/everything), whose README describes the project as MIT-licensed. Each entry links back to its upstream source. The `hosted` flag is set only when the upstream README provides a demo link without a “Demo URL not yet provided” warning. A hosted link is an external service and is not embedded or self-hosted by EVERYTHING-. Upstream links and availability may change; re-check the source before relying on a demo.

## Not included yet

- The remote compute worker that actually runs desktop applications. The adapter requires a compatible provider implementing [the remote runtime contract](docs/remote-runtime-api.md).
- Bundled local LLM weights or an inference engine. Local models must already be served by a compatible endpoint.
- Multi-user accounts/roles, server-side user storage, production-grade abuse controls, audit logs, or a managed production deployment. The optional access gate uses one shared password and in-memory sessions, not individual user accounts. Local notes are browser-specific and are not synced.
- Guaranteed compatibility with every app or low-memory phone.

## Requirements and local run

Node.js 22.12 or newer.

```bash
cp .env.example .env
npm test
npm start
```

Open `http://127.0.0.1:8787`. The server binds to localhost by default. Do not expose it publicly until authentication, HTTPS, durable rate limiting, monitoring, and a deployment security review are in place. A restricted local Docker Compose deployment is documented in [docs/local-container.md](docs/local-container.md).

## Optional access gate

For local use, no password is required; the server still binds to loopback by default. To require a shared password, set this in `.env`:

```env
AUTH_PASSWORD=use-a-long-random-password
COOKIE_SECURE=false
```

Restart the server and sign in through the overlay. Sessions use HttpOnly, SameSite=Strict cookies and expire after 12 hours; sessions are held in memory and are cleared when the server restarts.

For a trusted public hostname behind an HTTPS reverse proxy, also set `COOKIE_SECURE=true` and `TRUSTED_HOSTS=app.example.com`. The proxy must overwrite `X-Forwarded-Proto` with `https`. Public-host requests are rejected unless a password, Secure cookies, and an explicit trusted hostname are configured. Keep the Node server inaccessible directly from the internet.

This is a **single shared-password gate**, not multi-user authentication, role-based access control, or a substitute for a complete production security review.

## Optional AI and model routing

Single cloud provider:

```env
AI_API_ENABLED=true
OPENAI_API_KEY=your_provider_key
OPENAI_MODEL=your-model
OPENAI_BASE_URL=https://api.openai.com/v1
```

Local OpenAI-compatible server (for example, a local Ollama server):

```env
AI_API_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=your-installed-model-name
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
```

For multiple providers, set `AI_PROVIDERS_JSON` to a JSON array of profiles. Each profile uses `id`, `name`, `baseUrl`, `model`, optional `protocol`, optional `apiKeyEnv`, optional `enabled`, and optional `capabilities`. Supported protocols are `openai-compatible` (including NVIDIA NIM and many compatible gateways), `anthropic`, and `gemini`. API keys are resolved from server environment variables named by `apiKeyEnv`; do not place key values in the JSON. Replace each example model with one available to your account. All native adapters currently support text chat only; the protocol setting does not imply image/audio/video support.

Set `AI_DEFAULT_PROVIDER` to select the default profile. Optional `AI_FALLBACK_ENABLED=true` enables fallback to another configured provider after eligible provider errors; this may retry a request and incur costs, so it is off by default. The UI can select a provider and task category, and the router can use declared capabilities when auto-routing. Supported task labels are configured by each profile (for example `chat`, `coding`, `reasoning`, and `fast`); these labels do not add model modalities that the underlying endpoint does not support.

Restart after changing `.env`. Local endpoints and selected models must already be running; this project does not download model weights. Remote providers must use HTTPS; HTTP is allowed only for loopback endpoints. Never commit `.env` or put provider keys in browser code. Messages are sent to the selected provider, so review its privacy and retention policy before sending sensitive data. AI is disabled by default.

## Optional MCP tools

Configure one trusted MCP Streamable HTTP server:

```env
MCP_SERVER_URL=https://your-trusted-mcp-server.example/mcp
MCP_ACCESS_TOKEN=your_token_if_required
```

HTTP is allowed only for a local loopback server. Restart the app, discover tools, review the schema, enter JSON arguments, check the confirmation box, and approve the browser prompt before execution.

MCP tools can read, change, or delete data. Connect only trusted servers. The confirmation UI is not a replacement for production authentication or per-user authorization. The current build has one server-level configuration and no user accounts.

## Optional remote runtime

Configure a compatible remote worker:

```env
REMOTE_RUNTIME_URL=https://your-remote-worker.example/
REMOTE_RUNTIME_TOKEN=your_worker_token
```

The service must implement `GET /v1/capabilities`, `POST /v1/sessions`, and `DELETE /v1/sessions/{id}` as documented in [docs/remote-runtime-api.md](docs/remote-runtime-api.md). The workspace only offers apps advertised by that provider. The provider—not this Node.js adapter—must implement execution, isolation, quotas, session persistence, and cost controls. A provider must be deployed and configured before remote sessions can launch.

## API

- `GET /api/health` — service status.
- `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout` — optional shared-password access gate.
- `GET /api/apps?q=spreadsheet&category=Office` — catalog.
- `GET /api/ai/providers` — configured provider list and routing defaults, without secrets.
- `POST /api/ai/chat` — non-streaming OpenAI-compatible chat with optional `providerId` and `task` fields.
- `GET /api/runtime/capabilities?wasm=1&webgpu=0&network=1` — browser feature assessment plus adapter/configuration status.
- `GET /api/mcp/status`, `GET /api/mcp/tools` — MCP status and tool discovery.
- `POST /api/mcp/tools/call` — tool call; requires `confirmed: true`.
- `GET /api/runtime/remote/status`, `GET /api/runtime/remote/apps` — remote runtime status and app discovery.
- `POST /api/runtime/remote/sessions` — create a confirmed remote session.
- `POST /api/runtime/remote/sessions/close` — close a session created by the current server process.

These endpoints are not a public multi-user service. Do not expose them publicly without additional access controls.

## Roadmap

1. Workspace core — implemented.
2. AI gateway — implemented for OpenAI-compatible, Anthropic Messages, and Gemini text-chat protocols, with task-aware routing and optional fallback.
3. MCP discovery and confirmed calls — implemented for one configured Streamable HTTP server; protocol compatibility and auditing need broader testing.
4. Remote runtime adapter — implemented; compatible worker deployment is external.
5. Advanced AI modalities (image/audio/video), provider-specific streaming, and task capability benchmarking.
6. Local inference and low-resource device benchmarking.
7. User identity, isolated persistent storage, import/export and recovery.
8. Production hardening: multi-user identity/roles, durable rate limits, audit logs, monitoring, accessibility, security review, and deployment automation.

## Design principles

- Real functionality over mock screens.
- Lazy loading and low background resource use by default.
- No silent upload of private files or secrets.
- Verify third-party licenses before copying or redistributing source.
- Measure performance on real devices.
- Keep planned features clearly labeled until tested.

## Upstream project

This repository links to selected apps and source directories in [HeyPuter/everything](https://github.com/HeyPuter/everything). It is not a wholesale copy or fork. Upstream apps, assets, and models retain their own licenses and terms.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [docs/architecture.md](docs/architecture.md), and [docs/low-resource-strategy.md](docs/low-resource-strategy.md).

## License

The existing BSD 2-Clause license applies to original project code. Third-party apps, assets, and models retain their own licenses.

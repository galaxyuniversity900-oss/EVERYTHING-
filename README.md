# EVERYTHING-

**A lightweight web workspace for browser-based tools, with an opt-in server-side AI gateway.**

The long-term goal is to make useful software accessible on modest devices without requiring users to install every large desktop application. This repository is being built incrementally: browser-native applications where available, capability checks for WASM/WebGPU, and real remote runtimes only when a compatible service has actually been implemented and configured.

> **Status:** early foundation, not the finished platform. The app catalog, lightweight Node.js server, capability assessment, and opt-in OpenAI-compatible chat endpoint are implemented in this branch. Full remote app execution/streaming, local LLM inference, MCP tool execution, authentication, and persistent multi-user storage are not implemented.

## Implemented now

- Dependency-free Node.js HTTP server.
- Responsive, searchable, filterable app directory.
- Curated links to selected Puter Everything apps; entries without a verified hosted URL link to their source instead.
- `GET /api/health`, `GET /api/apps`, `GET /api/ai/providers`, and `GET /api/runtime/capabilities`.
- Opt-in `POST /api/ai/chat` using an OpenAI-compatible API.
- Server-side API key only; browser code never contains the provider secret.
- AI request validation, 48 KiB request body limit, message length/count limits, request timeout, basic per-IP in-memory rate limiting, and same-host Origin check when Origin is present.
- Browser capability report for WASM and WebGPU. This is a feature check, not a device benchmark or proof that a model/app fits available memory.
- Automated tests and GitHub Actions CI/smoke tests.
- Basic security, contribution, and license documentation.

## Requirements

- Node.js 22.12 or newer.

## Run locally

```bash
cp .env.example .env
npm test
npm start
```

Open `http://127.0.0.1:8787`.

The server binds to localhost by default. Keep that default for local use. Do not expose it publicly until authentication, HTTPS, durable rate limiting, abuse monitoring, and a deployment review have been implemented.

### Enable AI (optional)

Edit the local `.env` file:

```env
AI_API_ENABLED=true
OPENAI_API_KEY=your_real_provider_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Restart the server. Use a key from the provider you are authorized to use. The API key belongs only in the server-side `.env` file; do not put it in `public/`, source code, GitHub issues, or commits.

Compatible providers may use a different HTTPS base URL and model name. Local inference endpoints may use HTTP only when the host is localhost. A configured provider receives the chat messages sent through the AI panel; review its privacy and retention policy before sending sensitive data. AI remains disabled by default.

## API

### Health

```http
GET /api/health
```

### Application directory

```http
GET /api/apps
GET /api/apps?category=Office
GET /api/apps?q=spreadsheet
```

### AI provider status

```http
GET /api/ai/providers
```

Returns configuration status and the selected model name; it never returns the API key.

### AI chat

```http
POST /api/ai/chat
Content-Type: application/json

{"messages":[{"role":"user","content":"Explain WebAssembly in one paragraph."}]}
```

The endpoint is disabled unless both `AI_API_ENABLED=true` and `OPENAI_API_KEY` are set. It supports system/user/assistant messages and non-streaming replies in the current implementation. It is not an authenticated multi-user service; do not expose it publicly without additional protection.

### Browser capability assessment

```http
GET /api/runtime/capabilities?wasm=1&webgpu=0&network=1
```

This reports detected capability flags and a conservative mode recommendation. It does **not** execute apps remotely. The current response explicitly reports `remoteExecutionImplemented: false`.

## Architecture and next milestones

1. **Workspace core** — implemented.
2. **AI gateway foundation** — implemented for one OpenAI-compatible non-streaming endpoint, with configuration opt-in.
3. **Application capability manifests** — initial assessment implemented; per-app manifest enforcement and real adapters remain to be built.
4. **Remote runtime** — implement an authenticated session protocol and remote rendering/streaming, with isolation and resource quotas.
5. **Local inference** — benchmark compatible options (for example, small quantized models and browser runtimes) on real low-resource devices before claiming support.
6. **MCP** — add server connections, tool discovery, per-tool permissions, explicit confirmation for consequential actions, and audit logs before enabling execution.
7. **Identity and storage** — user isolation, persistence, import/export, and recovery.
8. **Production readiness** — hardened authentication, durable rate limiting, observability, deployment automation, accessibility, security review, and measured device compatibility.

## Design principles

- Real functionality over mock screens.
- Lazy loading and low background resource use by default.
- No silent upload of private files or secrets to external services.
- Verify third-party license and attribution before copying or redistributing source.
- Measure performance on real devices; do not promise universal compatibility.
- Keep planned features clearly labeled until tested.

## Relationship to Puter Everything

The catalog links to selected apps and source directories in [HeyPuter/everything](https://github.com/HeyPuter/everything). This repository is not a wholesale copy or fork. The upstream repository and each included app keep their own licenses and terms. Any future source reuse must be reviewed individually.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and testing workflow. Security guidance is in [SECURITY.md](SECURITY.md).

## License

The repository's existing BSD 2-Clause license applies to original project code. Third-party applications, assets, and models retain their own licenses and terms.

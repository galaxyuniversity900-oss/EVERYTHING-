# EVERYTHING-

**A lightweight web workspace for browser-based tools, with opt-in AI and MCP integration.**

The long-term goal is to make useful software accessible on modest devices without requiring every large desktop installation. This repository is being built incrementally: browser-native apps where available, capability checks for WASM/WebGPU, and real remote runtimes only when an execution service has actually been implemented.

> **Status:** early foundation, not the finished platform. Implemented here: app catalog, lightweight Node.js server, capability assessment, OpenAI-compatible non-streaming chat endpoint, and configured MCP Streamable HTTP tool discovery/calls with an explicit confirmation flow. Full remote app execution/streaming, a bundled local LLM runtime, authentication, durable storage, and production-grade abuse protection are not implemented.

## Implemented

- Dependency-free Node.js HTTP server.
- Responsive searchable/filterable app directory.
- Curated links to selected Puter Everything apps; entries without verified hosted URLs point to source.
- `GET /api/health`, `GET /api/apps`, `GET /api/ai/providers`, `GET /api/runtime/capabilities`.
- Opt-in `POST /api/ai/chat` for OpenAI-compatible APIs, including compatible local endpoints.
- Server-side API keys, message validation, request size/time limits, and basic in-memory per-IP rate limits.
- Browser feature assessment for WASM/WebGPU (not a benchmark).
- Configured MCP Streamable HTTP client: initialization, tool discovery, tool calls, optional bearer token, response-size/time limits, and UI confirmation before executing a tool.
- Automated unit tests and GitHub Actions HTTP smoke tests.
- Security, contribution and configuration documentation.

## Requirements

Node.js 22.12 or newer.

## Run locally

```bash
cp .env.example .env
npm test
npm start
```

Open `http://127.0.0.1:8787`. The server binds to localhost by default. Keep it local unless you have added authentication, HTTPS, durable rate limiting, monitoring, and a deployment security review.

## Optional AI configuration

Edit the ignored local `.env` file.

For a cloud provider:

```env
AI_API_ENABLED=true
OPENAI_API_KEY=your_provider_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

For a local OpenAI-compatible server such as an Ollama server running on the same machine:

```env
AI_API_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=your-installed-model-name
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
```

Local inference works only if the configured compatible server is actually running and has the selected model. This project does not download model weights or bundle a local inference engine. Local HTTP is allowed only for loopback hosts; remote providers must use HTTPS. Never put keys in frontend code or commit `.env`. Chat content is sent to the configured provider, so review its privacy/retention policy first. AI is disabled by default.

## Optional MCP configuration

Add a trusted MCP Streamable HTTP endpoint to `.env`:

```env
MCP_SERVER_URL=https://your-trusted-mcp-server.example/mcp
MCP_ACCESS_TOKEN=your_token_if_required
```

HTTP is allowed only for a local loopback server. Restart the app and use the MCP section to discover tools. Select a tool, inspect its description/schema, enter arguments as a JSON object, tick the confirmation box, and approve the browser confirmation before execution.

**MCP tools may read, change, or delete data.** Connect only trusted servers and review each tool call. The confirmation UI is not a replacement for authentication or production-grade authorization. The server currently supports one configured MCP endpoint and does not provide user accounts or per-user credentials.

## API

- `GET /api/health` — service status.
- `GET /api/apps?q=spreadsheet&category=Office` — catalog.
- `GET /api/ai/providers` — AI configuration status; never returns secrets.
- `POST /api/ai/chat` — non-streaming OpenAI-compatible chat.
- `GET /api/runtime/capabilities?wasm=1&webgpu=0&network=1` — feature assessment. Returns `remoteExecutionImplemented: false`.
- `GET /api/mcp/status` — whether an MCP URL is configured.
- `GET /api/mcp/tools` — initialize configured MCP server and discover tools.
- `POST /api/mcp/tools/call` — execute a selected tool only when request body includes `confirmed: true`.

Example chat body:

```json
{"messages":[{"role":"user","content":"Explain WebAssembly in one paragraph."}]}
```

Example MCP call body:

```json
{"name":"tool_name","arguments":{},"confirmed":true}
```

The endpoints are not a public multi-user service. Do not expose them publicly without additional access controls.

## Roadmap

1. Workspace core — implemented.
2. AI gateway foundation — implemented for one OpenAI-compatible non-streaming API shape.
3. MCP discovery and confirmed calls — implemented for one configured Streamable HTTP server; broaden protocol compatibility and add auditing.
4. Capability manifests and real per-app adapters.
5. Authenticated remote app execution/streaming with isolation and quotas.
6. Local inference benchmarking on real low-resource devices; publish measured support rather than promises.
7. User identity, isolated persistent storage, import/export and recovery.
8. Production hardening: authentication, durable rate limiting, monitoring, accessibility, security review, and deployment automation.

## Design principles

- Real functionality over mock screens.
- Low resource use and lazy loading by default.
- No silent upload of private files or secrets.
- Verify third-party licenses before copying or redistributing source.
- Measure performance on actual devices.
- Keep planned features clearly labeled until tested.

## Relationship to Puter Everything

This repository links to selected apps and source directories in [HeyPuter/everything](https://github.com/HeyPuter/everything). It is not a wholesale copy or fork. Upstream apps, assets and models retain their own licenses and terms; review each before reuse.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

The repository's existing BSD 2-Clause license applies to original project code. Third-party apps, assets and models retain their own licenses.

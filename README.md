# EVERYTHING-

**A lightweight web workspace for browser-based tools and a future adaptive AI runtime.**

The goal is to make useful software accessible on modest devices without forcing users to install every large desktop application. The project combines a curated app directory with an engineering path toward adaptive execution: browser-native apps where possible, WASM/WebGPU when appropriate, and remote execution for workloads that genuinely need stronger hardware.

> **Status:** early foundation. This branch contains a working Node.js app directory and catalog API. Adaptive execution, hosted app sessions, local LLM inference, cloud AI provider adapters, MCP integrations, accounts, and persistent user storage are **not implemented yet**. The roadmap is not a claim that those features already work.

## What exists in this branch

- Small Node.js HTTP server with no runtime dependencies.
- `GET /api/health` health endpoint.
- `GET /api/apps` searchable and filterable application catalog.
- Responsive browser UI with category filters and search.
- Curated external app links and source links.
- Basic Node.js test suite for catalog integrity and filtering.
- Localhost-only default binding to avoid exposing the server to a network by default.

## Requirements

- Node.js **22.12+**.

## Run locally

```bash
npm test
npm start
```

Open `http://127.0.0.1:8787`.

Optional environment variables:

- `HOST`: defaults to `127.0.0.1`.
- `PORT`: defaults to `8787`.

Only set `HOST=0.0.0.0` when you intentionally want the service reachable from other devices on your network and understand the security implications.

## API

### Health

```http
GET /api/health
```

Returns the service status and version.

### App catalog

```http
GET /api/apps
GET /api/apps?category=Office
GET /api/apps?q=spreadsheet
```

Returns the matching app entries, categories, and result count. The catalog entries point to third-party websites; this project does not host or guarantee those services.

## Architecture direction

1. **Workspace core** — catalog, local server, accessible UI and automated tests.
2. **Adaptive application runtime** — explicit capability manifests and selection between browser execution, WASM/WebGPU, and remote sessions. Never claim an app is remotely executable until an actual runtime adapter exists.
3. **AI gateway** — provider adapters with streaming, task routing, cost/latency limits, secret handling, and clear local-vs-cloud controls.
4. **Local model options** — optional small/quantized models when the device and browser support them; no assumption that a large model can run on low-memory phones.
5. **MCP and integrations** — permissioned tools, explicit user consent for sensitive actions, and audit-friendly execution.
6. **Storage and identity** — isolated user data, import/export, authentication, and backup before multi-user deployment.
7. **Performance and security** — measured memory/network use, dependency and license review, API limits, automated checks, and security testing.

## Design principles

- **Real functionality over mock screens.** Mark incomplete features as incomplete.
- **Low resource use by default.** Lazy-load code and avoid idle background work.
- **Privacy and user control.** Never silently send private files or secrets to external AI services.
- **Open-source hygiene.** Keep licenses and attribution for every upstream component clear; review each app's own license before vendoring or redistributing it.
- **Progressive compatibility.** A low-end phone should still be able to browse the catalog even when it cannot run a heavy workload locally.
- **Test what we claim.** Publish measured support matrices rather than promising universal compatibility.

## Relationship to Puter Everything

The catalog currently links to selected browser applications and their source directories in [HeyPuter/everything](https://github.com/HeyPuter/everything). This repository is **not** a fork or a wholesale copy of that project. Any future code reuse must be deliberate, with license, attribution, dependency, and maintenance review.

## Roadmap

- [x] Phase 1 foundation: app registry, catalog UI, API, basic tests.
- [ ] Phase 1 verification: execute tests and smoke-test on supported Node.js versions.
- [ ] Capability manifest schema and runtime adapter interface.
- [ ] First real runtime adapter with an end-to-end integration test.
- [ ] AI provider interface and one real, opt-in provider integration.
- [ ] Local inference experiment with documented device requirements.
- [ ] MCP integration with scoped permissions and user confirmation.
- [ ] Deployment, observability, security review, and contributor documentation.

## Contributing

Open an issue describing the use case, device constraints, and expected behavior. Changes should include tests and should not describe planned work as completed.

## License

The initial foundation is being developed in this repository. Before publishing a release, choose and add an explicit license for this project's own code and verify all third-party notices.

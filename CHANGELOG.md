# Changelog

## 0.12.0 — Bounded AI inference concurrency

- Added a configurable in-flight AI request limit to protect constrained CPU and memory resources.
- Added a clear retryable `429 ai_busy` response when all inference slots are occupied.
- Ensured each lease is released after success or failure and added regression tests for capacity, idempotent release, and bounded settings.
- Documented a single-request default recommendation for CPU-only Ollama hosts and wired syntax checks for the new module.

## 0.11.0 — Live local-model smoke test

- Added a manual and weekly GitHub Actions workflow that pulls a small Ollama model and makes a real completion through the app gateway.
- The workflow verifies model visibility, provider connectivity, successful chat output, and cleans up the temporary services.
- CI unit tests assert that the end-to-end workflow remains configured.

## 0.10.0 — Optional NVIDIA inference acceleration

- Added a separate Compose override that requests one NVIDIA GPU for the optional Ollama service.
- Extended CI and release validation to check CPU-only, local-AI, and NVIDIA-overlay Compose configurations without requiring a GPU runner.
- Documented the NVIDIA Container Toolkit prerequisite and kept CPU inference as the default.

## 0.9.0 — Optional self-hosted LLM runtime

- Added an opt-in Ollama Compose profile with persistent model storage, an internal-only API, a one-time model pull, and RAM/CPU bounds.
- Added an explicit internal-HTTP opt-in limited to single-label OpenAI-compatible service names; public HTTP endpoints remain rejected.
- Added provider-registry, chat-transport, and connection-check tests for internal model services.
- Kept local inference disabled by default; model weights are downloaded only after the operator activates the profile.

## 0.8.0 — Easier remote worker deployment

- Added a minimal non-root Docker CLI image and Linux Compose deployment for the optional remote worker.
- Added a separate worker environment template and documented Docker socket privilege, loopback-only access, group-ID setup, and the dedicated-host requirement.
- Extended container CI to validate the worker Compose configuration and build both platform images.
- Fixed a race that could launch more remote sessions than the configured concurrency limit; added regression coverage.

All notable changes to EVERYTHING- are recorded here.

## 0.7.0 — AI provider diagnostics

- Added a rate-limited provider connection check that probes model-list endpoints without generating completion tokens.
- Added an AI panel action with latency and configured-model availability feedback.
- Added protocol-specific checks for OpenAI-compatible, Anthropic, and Gemini endpoints with bounded responses/timeouts and no credential disclosure.
- Added tests for URL safety, provider authentication headers, UI wiring, and disabled-mode behavior.

## 0.6.0 — Remote execution foundations

- Added an optional Docker-backed remote worker for administrator-allowlisted app images.
- Added authenticated worker APIs, session URL tokens, HTTP/WebSocket proxying, resource limits, and session expiry.
- Added device-aware runtime profiles for memory, CPU concurrency, WebGPU exposure, and network constraints.
- Added auth-aware offline caching that avoids serving cached catalog responses when authentication is required or unknown.
- Documented the dedicated-host, wildcard HTTPS, and ephemeral-session requirements for remote execution.

## 0.5.0 — Access gate and verified catalog

- Added an optional shared-password sign-in overlay, HttpOnly/SameSite session cookies, rate-limited login, and logout.
- Added trusted-host checks for HTTPS reverse-proxy deployments.
- Expanded the app catalog to 50 upstream entries and distinguished hosted demo links from source-only projects.
- Added a restricted local container workflow and security/deployment documentation.

## 0.4.0 — Local workspace

- Added browser-local notes, AI prompts, and text snippets using IndexedDB.
- Added search, edit/delete, JSON import/export, and an explicit handoff into the AI input.
- Added validation limits and collision-safe import merging.
- Extended offline PWA caching for local workspace assets and added a low-resource source-asset budget.

## 0.3.0 — Foundation

- Added a lightweight Node.js workspace server and searchable app catalog.
- Added installable PWA shell and offline cache for static UI/catalog data.
- Added opt-in OpenAI-compatible chat, plus native Anthropic and Gemini text-chat adapters.
- Added server-side provider-key references, task-aware routing, optional fallback, and local compatible endpoint support.
- Added MCP Streamable HTTP discovery and explicitly confirmed tool execution.
- Added remote runtime capability discovery, session adapter, tests, CI, and security documentation.

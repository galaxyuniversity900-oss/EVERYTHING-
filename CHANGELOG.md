# Changelog

## 0.5.0 — Verified application catalog

- Expanded the catalog to 50 upstream app entries across office, collaboration, creative, engineering, productivity, finance, business, developer, and games categories.
- Distinguished published demo links from source-only projects using upstream README link-status notes.
- Added registry tests for catalog breadth, source attribution, and truthful hosted status.


All notable changes to EVERYTHING- are recorded here.

## 0.5.0 — Access gate

- Added an optional shared-password sign-in overlay and logout flow.
- Added HttpOnly, SameSite=Strict in-memory sessions with a 12-hour expiry.
- Protected API routes when the access gate is enabled and added login rate limiting.
- Added trusted-host checks for HTTPS reverse-proxy deployments.

## 0.4.0 — Local workspace

- Added browser-local notes, AI prompts, and text snippets using IndexedDB.
- Added search, edit/delete, JSON import/export, and an explicit handoff into the AI input.
- Added validation limits and tests for local item imports.
- Extended offline PWA caching for local workspace assets.

## 0.3.0 — Foundation

- Added a lightweight Node.js workspace server and searchable app catalog.
- Added installable PWA shell and offline cache for static UI/catalog data.
- Added opt-in OpenAI-compatible chat, plus native Anthropic and Gemini text-chat adapters.
- Added server-side provider registry, task-aware routing, optional fallback, and local compatible endpoint support.
- Added MCP Streamable HTTP discovery and explicitly confirmed tool execution.
- Added remote runtime capability discovery and session adapter with an external worker contract.
- Added capability assessment, automated tests, GitHub Actions CI, and security/contributor documentation.
- Documented current boundaries: no bundled LLM weights, remote worker, authentication, or production storage.

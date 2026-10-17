# Security Policy

## Safe configuration

- The server binds to `127.0.0.1` by default.
- Do not expose this service publicly without authentication, HTTPS, durable rate limiting, abuse monitoring, and a deployment security review.
- AI is disabled unless `AI_API_ENABLED=true` and a provider is configured on the server. Cloud providers require a server-side key; localhost-compatible inference endpoints may be keyless.
- Never place provider keys or MCP tokens in frontend code or commit them.
- AI messages are sent to the configured provider. Review its retention and privacy policy before sending sensitive data.
- MCP tool discovery and calls are implemented for one configured Streamable HTTP server. Tools may have side effects; connect only trusted servers and review each call.
- The current confirmation UI and in-memory rate limits are basic safeguards, not production-grade authorization or abuse prevention.
- A shared-password access gate is available, but multi-user identity/roles and persistent server-side user storage are not implemented. The remote session adapter requires an external worker.
- MCP bearer tokens are shared server configuration in this version, not per-user credentials.
- Public-host mode requires an access password, Secure cookies, a trusted hostname allowlist, and an HTTPS reverse proxy that sets `X-Forwarded-Proto` correctly. Do not expose the Node port directly.
- The Docker worker must run on a dedicated host with trusted/pinned images, loopback-only container port bindings, and a reverse proxy. Session URLs are bearer credentials; avoid logging wildcard session hostnames. Sessions are ephemeral and are not a hostile-code multi-tenant sandbox.
- The service worker fails closed for offline catalog access until it has confirmed authentication is disabled. A `401` response clears any cached catalog copy so a previous authorized visit does not leave the app directory available offline after sign-out.
- Browser-local notes and prompts are stored in IndexedDB without application-level encryption. They are not sent to the server automatically, but scripts running on the same origin can access them; avoid storing passwords, API keys, or other secrets there.

## Reporting

Do not publish secrets or exploitable details in a public issue. Use GitHub private vulnerability reporting if enabled, or contact the maintainers privately.

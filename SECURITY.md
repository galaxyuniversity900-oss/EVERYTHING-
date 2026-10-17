# Security Policy

## Safe configuration

- The server binds to `127.0.0.1` by default.
- Do not expose this service publicly without authentication, HTTPS, durable rate limiting, abuse monitoring, and a deployment security review.
- AI is disabled unless `AI_API_ENABLED=true` and a provider is configured on the server. Cloud providers require a server-side key; localhost-compatible inference endpoints may be keyless.
- Never place provider keys or MCP tokens in frontend code or commit them.
- AI messages are sent to the configured provider. Review its retention and privacy policy before sending sensitive data.
- MCP tool discovery and calls are implemented for one configured Streamable HTTP server. Tools may have side effects; connect only trusted servers and review each call.
- The current confirmation UI and in-memory rate limits are basic safeguards, not production-grade authorization or abuse prevention.
- Multi-user authentication, remote app runtime sessions, and persistent user storage are not implemented.
- MCP bearer tokens are shared server configuration in this version, not per-user credentials.
- Browser-local notes and prompts are stored in IndexedDB without application-level encryption. They are not sent to the server automatically, but scripts running on the same origin can access them; avoid storing passwords, API keys, or other secrets there.

## Reporting

Do not publish secrets or exploitable details in a public issue. Use GitHub private vulnerability reporting if enabled, or contact the maintainers privately.

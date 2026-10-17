# Security Policy

## Safe configuration

- The server binds to `127.0.0.1` by default.
- Do not expose this service publicly without authentication, HTTPS, durable rate limiting, abuse monitoring, and a deployment security review.
- AI is disabled unless `AI_API_ENABLED=true` and `OPENAI_API_KEY` is configured on the server.
- Never place provider keys in frontend code or commit them.
- AI messages are sent to the configured provider. Review its retention and privacy policy before sending sensitive data.
- The in-memory rate limit is a basic safeguard, not production-grade abuse prevention.
- MCP tool execution, remote runtime sessions, authentication, and persistent user storage are not yet implemented.

## Reporting

Do not publish secrets or exploitable details in a public issue. Use GitHub private vulnerability reporting if enabled, or contact the maintainers privately.

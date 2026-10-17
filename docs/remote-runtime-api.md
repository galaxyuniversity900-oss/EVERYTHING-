# Remote Runtime Provider Contract

EVERYTHING- contains a client adapter; it does not include the GPU/desktop worker or run a cloud runtime itself. Configure `REMOTE_RUNTIME_URL` to a trusted service implementing this contract. The adapter appends the paths below to the configured base URL.

Use HTTPS for non-local services. Optional authentication is sent as `Authorization: Bearer <REMOTE_RUNTIME_TOKEN>`. All responses must be JSON and must not redirect. The current client limits response bodies to 1 MiB and applies a request timeout.

## 1. Discover capabilities

`GET /v1/capabilities`

Example response:

```json
{
  "provider": "Example Remote Runtime",
  "apps": [
    {
      "id": "image-editor",
      "name": "Remote Image Editor",
      "description": "A sandboxed image-editing session"
    }
  ]
}
```

Only app IDs advertised here can be launched by the workspace. IDs must contain letters, numbers, underscores, dots, or hyphens and be at most 80 characters.

## 2. Create a session

`POST /v1/sessions`

Request:

```json
{
  "appId": "image-editor",
  "client": "everything-platform",
  "version": "0.3.0"
}
```

Response (HTTP 201 or another successful 2xx):

```json
{
  "id": "session-123",
  "url": "https://session.example.test/view",
  "expiresAt": "2026-10-17T18:00:00Z"
}
```

The session URL must use HTTPS, except that HTTP is accepted for loopback addresses during local development. URLs with embedded credentials are rejected.

## 3. Close a session

`DELETE /v1/sessions/{sessionId}`

Return any successful 2xx JSON response. The workspace calls this only for a session created by the current server process.

## Provider responsibilities

The provider is responsible for actual execution, container/VM isolation, per-session identity, authentication, resource quotas, idle timeouts, file persistence, cost controls, and safe session URLs. Do not treat the adapter as a sandbox. Never expose an untrusted provider to this workspace. A session URL may grant access to a running workload, so treat it as sensitive.

This contract is a simple integration boundary, not a claim that a remote worker is deployed or that a particular app can already run remotely.

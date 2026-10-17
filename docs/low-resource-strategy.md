# Low-resource design and measurement

The project aims to keep the workspace shell small enough for phones and low-memory devices. This does not mean every linked application or AI model will run locally.

## Current safeguards

- Node.js server uses built-in modules only; there are no runtime npm dependencies.
- Browser shell assets are browser modules and cached by the PWA service worker.
- The public application catalog can be cached offline. AI, MCP, and remote-runtime API responses are never cached by the service worker.
- Local notes and prompts use IndexedDB and are bounded to 200 items, 100,000 characters per item, and 2 MiB per import file.
- AI request context is bounded in the browser; provider response bodies are size-limited on the server.
- No remote fonts or heavy UI frameworks are required.

## CI budget

The performance test enforces a combined uncompressed source-asset budget below 250 KiB for the HTML, CSS, JavaScript modules, manifest, and SVG icon. This is a source-size budget, not a network transfer or performance benchmark.

## What still needs real-device measurement

- Cold and warm page-load time on Android devices with 2–4 GiB RAM.
- Service-worker installation and offline reload behavior.
- IndexedDB performance and quota behavior across mobile browsers.
- Network transfer size after HTTP compression.
- Memory and latency for each configured local inference server/model.
- Remote session latency, bandwidth, resource quotas, and idle shutdown.

Do not publish device compatibility claims until measurements are collected and tested device/browser versions are recorded.

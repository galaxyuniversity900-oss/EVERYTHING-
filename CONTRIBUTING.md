# Contributing to EVERYTHING-

Contributions are welcome. The project prioritizes tested functionality over placeholder UI.

## Requirements and development

Use Node.js 22.12 or later.

```bash
cp .env.example .env
npm test
npm start
```

AI remains disabled unless explicitly enabled and a valid server-side key is configured.

## Pull requests

- Describe the user problem and expected behavior.
- Add automated tests for new functionality and regressions.
- Document environment variables and operational limits.
- Do not claim a feature is implemented until it passes a real integration test.
- Preserve third-party licenses and attribution.
- Test on low-resource devices where relevant and report measured results.

## Architecture principles

- Prefer browser-native execution for lightweight workloads.
- Use WASM/WebGPU only when compatible and tested.
- Heavy execution requires a real configured runtime, not a mock response.
- Keep secrets server-side and obtain consent before sending sensitive data to external providers.

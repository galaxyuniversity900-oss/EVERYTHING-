# Run EVERYTHING- on Android / Termux

The main workspace is a small Node.js web server and can run in Termux. This does **not** mean heavy desktop applications or large LLM models will run locally on a low-memory phone. Those require a compatible browser app, a separate model endpoint, or a deployed remote worker.

## 1. Install the basics

In Termux:

```sh
pkg update
pkg install nodejs-lts git
node --version
git --version
```

Use Node.js **22.12 or newer**.

## 2. Get the project

```sh
git clone https://github.com/galaxyuniversity900-oss/EVERYTHING-.git
cd EVERYTHING-
npm test
npm start
```

The server binds to `127.0.0.1:8787` by default. Open this address in the Android browser:

```text
http://127.0.0.1:8787
```

The project has no runtime npm dependencies, so an `npm install` step is not required for the workspace server.

## 3. Use it as a lightweight workspace

- Search the app directory and open the upstream browser app you need.
- Save notes and prompts in the local workspace. Export a JSON backup before clearing browser data or moving to another device.
- Install the PWA from the browser menu if your browser offers **Add to Home screen**.
- The shell and public catalog can work offline after the service worker is installed. AI, MCP, and remote-session requests still need a reachable service.

## 4. Configure AI (optional)

AI is disabled until you configure a provider in the server's `.env` file and set `AI_API_ENABLED=true`. Copy `.env.example` to `.env` and edit it using a text editor, then restart the server.

For a weak phone, prefer a remote provider API or a model server on another machine. A local endpoint such as `http://127.0.0.1:11434/v1` only works if a compatible model server is actually running on the same device. Large model weights are not bundled with EVERYTHING-.

Use **Test connection** in the AI panel before sending a prompt. Connection tests query the provider's model-list endpoint; they do not generate a completion.

## 5. Remote application sessions

The optional Docker worker is **not intended to run in Termux on a low-memory phone**. Deploy it on a dedicated Linux host with Docker, approved container images, wildcard HTTPS DNS, and a reverse proxy. Follow [the remote worker guide](../remote-worker/README.md). The main app then connects to that worker using `REMOTE_RUNTIME_URL` and `REMOTE_RUNTIME_TOKEN`.

## Security

- Keep the main server bound to loopback for local use.
- Do not expose the Node port directly to the internet.
- Never put provider keys in browser JavaScript or local notes.
- The optional shared-password gate is a single shared credential, not per-user accounts.
- The remote Docker worker has host-level privilege and must run only on a dedicated, trusted server.

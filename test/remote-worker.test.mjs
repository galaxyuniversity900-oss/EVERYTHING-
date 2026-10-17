import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { createRemoteWorker, waitForTcpPort } from "../remote-worker/server.mjs";

const token = "worker-token-value-that-is-at-least-32-bytes-long";
const apps = [{ id: "desktop", name: "Desktop", description: "Containerized desktop", image: "example/desktop:stable", port: 3000, memory: "1g", cpus: 1, pids: 128 }];

function makeWorker({ maxSessions = 2, now = () => Date.now(), delayRun = false, failFirstPort = false, appConfigs = apps, probePortImpl = async () => true } = {}) {
  const calls = [];
  let shouldFailPort = failFirstPort;
  const worker = createRemoteWorker({
    now,
    env: {
      WORKER_TOKEN: token,
      WORKER_PUBLIC_BASE_URL: "https://runtime.example.test",
      WORKER_SESSION_BASE_URL: "https://sessions.example.test",
      WORKER_APPS_JSON: JSON.stringify(appConfigs),
      WORKER_MAX_SESSIONS: String(maxSessions)
    },
    probePortImpl,
    execFileImpl: async (_command, args) => {
      calls.push(args);
      if (args[0] === "run" && delayRun) await new Promise((resolve) => setTimeout(resolve, 25));
      if (args[0] === "run") return { stdout: "container-id" };
      if (args[0] === "port" && shouldFailPort) {
        shouldFailPort = false;
        throw new Error("simulated docker port failure");
      }
      if (args[0] === "port") return { stdout: "127.0.0.1:34567\n" };
      if (args[0] === "rm" || args[0] === "ps") return { stdout: "" };
      throw new Error("Unexpected container command");
    }
  });
  return { ...worker, calls };
}

async function listen(worker) {
  await new Promise((resolve) => worker.server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${worker.server.address().port}`;
}

function requestSessionHost(base, host, forwardedProto = "https") {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: Number(url.port),
      path: "/",
      method: "GET",
      headers: { host, "x-forwarded-proto": forwardedProto }
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", reject);
    request.end();
  });
}

test("worker configuration requires a long token and valid public session base", () => {
  assert.throws(() => createRemoteWorker({ env: {} }), /WORKER_TOKEN/);
  assert.throws(() => createRemoteWorker({ env: {
    WORKER_TOKEN: token, WORKER_HOST: "eth0", WORKER_PUBLIC_BASE_URL: "https://runtime.example.test",
    WORKER_SESSION_BASE_URL: "https://sessions.example.test", WORKER_APPS_JSON: "[]"
  } }), /WORKER_HOST must be loopback/);
  assert.throws(() => createRemoteWorker({
    env: { WORKER_TOKEN: token, WORKER_PUBLIC_BASE_URL: "https://runtime.example.test", WORKER_SESSION_BASE_URL: "http://sessions.example.test", WORKER_APPS_JSON: "[]" }
  }), /WORKER_SESSION_BASE_URL/);
  assert.throws(() => createRemoteWorker({
    env: { WORKER_TOKEN: token, WORKER_PUBLIC_BASE_URL: "https://runtime.example.test", WORKER_SESSION_BASE_URL: "https://sessions.example.test", WORKER_APPS_JSON: JSON.stringify([{ ...apps[0], memory: "999999g" }]) }
  }), /memory must be between 128m and 16g/);
});

test("worker requires bearer authentication for capabilities", async () => {
  const worker = makeWorker();
  const base = await listen(worker);
  try {
    const response = await fetch(`${base}/v1/capabilities`);
    assert.equal(response.status, 401);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
  } finally { await worker.close(); }
});

test("worker rejects untrusted API Host headers", async () => {
  const worker = makeWorker();
  const base = await listen(worker);
  try {
    const url = new URL(base);
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: url.hostname,
        port: Number(url.port),
        path: "/api/health",
        method: "GET",
        headers: { host: "attacker.example", "x-forwarded-proto": "https" }
      }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          try {
            assert.equal(JSON.parse(body).error.code, "untrusted_host");
            resolve(response.statusCode);
          } catch (error) { reject(error); }
        });
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(status, 403);
  } finally { await worker.close(); }
});

test("session proxy requires the correct view token and forwarded HTTPS", async () => {
  const worker = makeWorker();
  const base = await listen(worker);
  try {
    const response = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    });
    assert.equal(response.status, 201);
    const session = await response.json();
    const sessionHost = new URL(session.url).host;
    const [label, ...domain] = sessionHost.split(".");
    const [id, viewToken] = label.split("-");
    assert.match(id, /^[a-f0-9]{16}$/);
    assert.match(viewToken, /^[a-f0-9]{32}$/);
    const wrongTokenHost = `${id}-${"0".repeat(32)}.${domain.join(".")}`;
    assert.equal(await requestSessionHost(base, wrongTokenHost), 404);
    assert.equal(await requestSessionHost(base, sessionHost, "http"), 404);
    assert.equal(worker.sessions.size, 1);
  } finally { await worker.close(); }
});

test("worker advertises only configured apps and launches allowlisted containers", async () => {
  const worker = makeWorker();
  const base = await listen(worker);
  try {
    const capabilities = await fetch(`${base}/v1/capabilities`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(capabilities.status, 200);
    const capabilityData = await capabilities.json();
    const advertisedApps = capabilityData.apps;
    assert.deepEqual(capabilityData.capacity, { activeSessions: 0, pendingSessions: 0, maxSessions: 2, availableSlots: 2 });
    assert.deepEqual(advertisedApps.map((app) => app.id), ["desktop"]);
    assert.deepEqual(advertisedApps[0].resources, { memory: "1g", shmSize: "256m", cpus: 1, pids: 128, gpus: 0 });

    const bad = await fetch(`${base}/v1/sessions`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appId: "arbitrary-image" })
    });
    assert.equal(bad.status, 400);

    const response = await fetch(`${base}/v1/sessions`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop", client: "everything-platform" })
    });
    assert.equal(response.status, 201);
    const session = await response.json();
    assert.match(session.id, /^[a-f0-9]{16}$/);
    assert.match(session.url, /^https:\/\/[a-f0-9]{16}-[a-f0-9]{32}\.sessions\.example\.test\/$/);
    assert.ok(worker.calls.some((args) => args[0] === "run" && args.includes("--cap-drop") && args.includes("ALL") && args.includes("127.0.0.1::3000/tcp")));
    assert.equal(worker.sessions.size, 1);

    const deleted = await fetch(`${base}/v1/sessions/${session.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    assert.equal(deleted.status, 200);
    assert.equal(worker.sessions.size, 0);
    assert.ok(worker.calls.some((args) => args[0] === "rm" && args.includes(`everything-${session.id}`)));
  } finally { await worker.close(); }
});

test("worker enforces the configured concurrent session limit", async () => {
  const worker = makeWorker({ maxSessions: 1 });
  const base = await listen(worker);
  try {
    const options = {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    };
    const first = await fetch(`${base}/v1/sessions`, options);
    assert.equal(first.status, 201);
    const second = await fetch(`${base}/v1/sessions`, options);
    assert.equal(second.status, 429);
  } finally { await worker.close(); }
});


test("worker expires absolute-TTL and idle sessions and removes their containers", async () => {
  let clock = 10_000;
  const worker = makeWorker({ now: () => clock });
  const base = await listen(worker);
  try {
    const create = async () => {
      const response = await fetch(`${base}/v1/sessions`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ appId: "desktop" })
      });
      assert.equal(response.status, 201);
      return response.json();
    };

    const absolute = await create();
    clock += 60 * 60 * 1000;
    const absoluteExpired = await requestSessionHost(base, new URL(absolute.url).host);
    assert.equal(absoluteExpired, 404);
    assert.equal(worker.sessions.size, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(worker.calls.some((args) => args[0] === "rm" && args.includes(`everything-${absolute.id}`)));

    clock += 1;
    const idle = await create();
    clock += 15 * 60 * 1000;
    const idleExpired = await requestSessionHost(base, new URL(idle.url).host);
    assert.equal(idleExpired, 404);
    assert.equal(worker.sessions.size, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(worker.calls.some((args) => args[0] === "rm" && args.includes(`everything-${idle.id}`)));
  } finally { await worker.close(); }
});


test("worker reserves capacity during concurrent container startup", async () => {
  const worker = makeWorker({ maxSessions: 1, delayRun: true });
  const base = await listen(worker);
  try {
    const options = {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    };
    const results = await Promise.all([
      fetch(`${base}/v1/sessions`, options),
      fetch(`${base}/v1/sessions`, options)
    ]);
    assert.deepEqual(results.map((response) => response.status).sort((a, b) => a - b), [201, 429]);
    assert.equal(worker.sessions.size, 1);
    assert.equal(worker.calls.filter((args) => args[0] === "run").length, 1);
  } finally { await worker.close(); }
});


test("worker rolls back a started container when port discovery fails and releases capacity", async () => {
  const worker = makeWorker({ maxSessions: 1, failFirstPort: true });
  const base = await listen(worker);
  try {
    const options = {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    };
    const failed = await fetch(base + "/v1/sessions", options);
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).error.code, "container_runtime_error");
    assert.equal(worker.sessions.size, 0);
    assert.ok(worker.calls.some((args) => args[0] === "rm" && args.some((value) => typeof value === "string" && /^everything-[a-f0-9]{16}$/.test(value))));
    const retry = await fetch(base + "/v1/sessions", options);
    assert.equal(retry.status, 201);
    assert.equal(worker.sessions.size, 1);
  } finally { await worker.close(); }
});


test("worker allocates GPUs only when an administrator configures them", async () => {
  const worker = makeWorker({ appConfigs: [{ ...apps[0], gpus: 1 }] });
  const base = await listen(worker);
  try {
    const response = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    });
    assert.equal(response.status, 201);
    assert.ok(worker.calls.some((args) => args[0] === "run" && args.includes("--gpus") && args.includes("1")));
  } finally { await worker.close(); }
});

test("worker rejects invalid GPU allocation counts in app configuration", () => {
  for (const gpus of [-1, 1.5, 5, "not-a-number"]) {
    assert.throws(() => createRemoteWorker({
      env: {
        WORKER_TOKEN: token,
        WORKER_PUBLIC_BASE_URL: "https://runtime.example.test",
        WORKER_SESSION_BASE_URL: "https://sessions.example.test",
        WORKER_APPS_JSON: JSON.stringify([{ ...apps[0], gpus }])
      }
    }), /GPUs must be an integer between 0 and 4/);
  }
});


test("worker applies configured shared-memory limits to Docker containers", async () => {
  const worker = makeWorker({ appConfigs: [{ ...apps[0], shmSize: "1g" }] });
  const base = await listen(worker);
  try {
    const response = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    });
    assert.equal(response.status, 201);
    const runArgs = worker.calls.find((args) => args[0] === "run");
    assert.ok(runArgs.includes("--shm-size"));
    assert.ok(runArgs.includes("1g"));
  } finally { await worker.close(); }
});

test("worker rejects shared-memory limits outside the configured safe range", () => {
  for (const shmSize of ["1m", "3g", "not-a-size"]) {
    assert.throws(() => createRemoteWorker({
      env: {
        WORKER_TOKEN: token,
        WORKER_PUBLIC_BASE_URL: "https://runtime.example.test",
        WORKER_SESSION_BASE_URL: "https://sessions.example.test",
        WORKER_APPS_JSON: JSON.stringify([{ ...apps[0], shmSize }])
      }
    }), /shmSize must be between 64m and 2g/);
  }
});

test("worker rolls back a container when the application port never becomes ready", async () => {
  const worker = makeWorker({ maxSessions: 1, probePortImpl: async () => false });
  const base = await listen(worker);
  try {
    const response = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ appId: "desktop" })
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, "container_startup_timeout");
    assert.equal(worker.sessions.size, 0);
    const runArgs = worker.calls.find((args) => args[0] === "run");
    const containerName = runArgs[runArgs.indexOf("--name") + 1];
    assert.ok(worker.calls.some((args) => args[0] === "rm" && args.includes(containerName)));
  } finally { await worker.close(); }
});

test("worker clamps the configured application startup timeout", async () => {
  const worker = createRemoteWorker({
    env: {
      WORKER_TOKEN: token,
      WORKER_PUBLIC_BASE_URL: "https://runtime.example.test",
      WORKER_SESSION_BASE_URL: "https://sessions.example.test",
      WORKER_STARTUP_TIMEOUT_SECONDS: "999",
      WORKER_APPS_JSON: JSON.stringify(apps)
    },
    probePortImpl: async () => true,
    execFileImpl: async () => ({ stdout: "" })
  });
  assert.equal(worker.config.startupTimeoutMs, 60_000);
  await worker.close();
});

test("TCP readiness probe detects a listening app port", async () => {
  const server = createTcpServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    assert.equal(await waitForTcpPort(server.address().port, { timeoutMs: 1000 }), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("TCP readiness probe times out when no app port is listening", async () => {
  const server = createTcpServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await waitForTcpPort(port, { timeoutMs: 100 }), false);
});

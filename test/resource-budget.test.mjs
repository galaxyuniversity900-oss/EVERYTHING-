import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assets = [
  "public/index.html", "public/styles.css", "public/auth.css", "public/ai.css", "public/mcp.css",
  "public/remote.css", "public/workspace.css", "public/app.js", "public/auth.js", "public/ai.js",
  "public/runtime.js", "public/device-profile.js", "public/mcp.js", "public/remote.js", "public/workspace.js",
  "public/workspace-core.js", "public/sw.js", "public/manifest.webmanifest", "public/icon.svg"
];

test("browser workspace source assets remain below 250 KiB", async () => {
  let total = 0;
  for (const file of assets) {
    const data = await readFile(new URL(`../${file}`, import.meta.url));
    total += data.byteLength;
  }
  assert.ok(total < 250 * 1024, `Asset budget exceeded: ${total} bytes`);
});

test("runtime package does not declare npm dependencies", async () => {
  const data = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(data.dependencies || {}, {});
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/ai.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/ai.css", import.meta.url), "utf8");

test("AI panel exposes an explicit provider connection test", () => {
  assert.match(html, /id="ai-check-provider"/);
  assert.match(script, /\/api\/ai\/providers\/check/);
  assert.match(script, /Connection OK/);
  assert.match(script, /Connection test failed/);
  assert.match(css, /\.ai-test-button/);
});

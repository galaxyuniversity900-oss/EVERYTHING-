import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("app directory has device-local favorites and recently used views", () => {
  assert.match(html, /data-view="favorites"/);
  assert.match(html, /data-view="recent"/);
  assert.match(html, /id="favorite-count"/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(app, /MAX_RECENT = 12/);
  assert.match(app, /data-favorite/);
  assert.match(app, /data-launch/);
});

test("low-resource layout preference persists and applies a compact class", () => {
  assert.match(html, /id="compact-mode"/);
  assert.match(app, /document\.body\.classList\.toggle\("compact-mode"/);
  assert.match(css, /\.compact-mode \.app-grid/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("install prompt is user-triggered and PWA cache version advances", () => {
  assert.match(html, /id="install-app"/);
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /installPrompt\.prompt\(\)/);
  assert.match(worker, /everything-shell-v3/);
  assert.doesNotMatch(worker, /\/api\/ai\/chat/);
});

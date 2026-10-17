import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

test("workspace exposes persistent favorites and recent-app views", () => {
  assert.match(html, /data-view="favorites"/);
  assert.match(html, /data-view="recent"/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(app, /MAX_RECENT = 12/);
  assert.match(app, /data-favorite/);
  assert.match(app, /data-launch/);
});

test("compact mode is stored locally and changes the layout", () => {
  assert.match(html, /id="compact-mode"/);
  assert.match(app, /compact-mode/);
  assert.match(css, /\.compact-mode \.app-grid/);
});

test("installable workspace manifest and offline shell are configured", () => {
  assert.equal(manifest.name, "EVERYTHING- Workspace");
  assert.ok(manifest.start_url);
  assert.match(html, /rel="manifest"/);
  assert.match(worker, /everything-shell-v1/);
  assert.match(worker, /\/api\/apps/);
  assert.doesNotMatch(worker, /\/api\/ai\/chat/);
});

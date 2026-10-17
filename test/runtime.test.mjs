import test from "node:test";
import assert from "node:assert/strict";
import { assessCapabilities } from "../src/runtime/capabilities.mjs";

test("browser mode is the fallback when no advanced capability is available", () => {
  const result = assessCapabilities({});
  assert.equal(result.recommendedMode, "browser");
  assert.ok(result.modes.some((mode) => mode.mode === "browser" && mode.available));
});

test("remote execution is recommended only when configured and online", () => {
  assert.equal(assessCapabilities({ remoteAvailable: true, network: true }).recommendedMode, "remote");
  assert.notEqual(assessCapabilities({ remoteAvailable: true, network: false }).recommendedMode, "remote");
});

test("WebGPU is preferred to WASM when both are available and remote is not", () => {
  assert.equal(assessCapabilities({ webgpu: true, wasm: true }).recommendedMode, "webgpu");
});

import test from "node:test";
import assert from "node:assert/strict";
import { inspectDeviceCapabilities, recommendRuntime, describeDeviceProfile } from "../public/device-profile.js";

test("device profile detects constrained memory, CPU, and network signals", () => {
  const profile = inspectDeviceCapabilities({
    deviceMemory: 2,
    hardwareConcurrency: 4,
    connection: { effectiveType: "3g", saveData: true },
    onLine: true,
    gpu: undefined
  });
  assert.equal(profile.memoryGb, 2);
  assert.equal(profile.cores, 4);
  assert.equal(profile.lowMemory, true);
  assert.equal(profile.lowCpu, true);
  assert.equal(profile.constrainedNetwork, true);
  assert.equal(profile.constrained, true);
  assert.equal(profile.webgpuAvailable, false);
});

test("constrained devices prefer a configured remote runtime and otherwise stay browser-native", () => {
  const profile = inspectDeviceCapabilities({ deviceMemory: 2, hardwareConcurrency: 2, onLine: true });
  assert.equal(recommendRuntime(profile, { remoteRuntimeConfigured: true }), "remote");
  assert.equal(recommendRuntime(profile, { remoteRuntimeConfigured: false }), "browser");
  assert.match(describeDeviceProfile(profile, { remoteRuntimeConfigured: false }), /avoid large local LLMs/);
});

test("device profile handles unavailable hardware signals without inventing estimates", () => {
  const profile = inspectDeviceCapabilities({ onLine: false });
  assert.equal(profile.memoryGb, null);
  assert.equal(profile.cores, null);
  assert.equal(recommendRuntime(profile, { remoteRuntimeConfigured: true }), "browser");
  assert.match(describeDeviceProfile(profile), /RAM estimate unavailable/);
});

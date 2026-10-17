const modes = new Set(["browser", "wasm", "webgpu", "remote"]);

export function assessCapabilities(input = {}) {
  const caps = {
    wasm: Boolean(input.wasm),
    webgpu: Boolean(input.webgpu),
    memoryGb: Number.isFinite(input.memoryGb) && input.memoryGb > 0 ? Math.min(input.memoryGb, 1024) : null,
    network: input.network !== false,
    remoteAvailable: Boolean(input.remoteAvailable)
  };
  const recommendations = [
    { mode: "browser", available: true, reason: "Best default for lightweight browser-native applications." },
    { mode: "wasm", available: caps.wasm, reason: caps.wasm ? "WebAssembly is available." : "This browser did not report WebAssembly support." },
    { mode: "webgpu", available: caps.webgpu, reason: caps.webgpu ? "WebGPU is available; workload compatibility must still be checked." : "WebGPU is unavailable or was not detected." },
    { mode: "remote", available: caps.network && caps.remoteAvailable, reason: caps.network && caps.remoteAvailable ? "A remote runtime has been configured." : "Remote execution requires network access and a configured remote runtime." }
  ];
  return {
    capabilities: caps,
    recommendedMode: caps.remoteAvailable && caps.network ? "remote" : caps.webgpu ? "webgpu" : caps.wasm ? "wasm" : "browser",
    modes: recommendations.filter((item) => modes.has(item.mode))
  };
}

export const capabilityManifestSchema = {
  required: ["id", "version", "supportedModes"],
  fields: {
    id: "Stable application identifier",
    version: "Manifest version",
    supportedModes: ["browser", "wasm", "webgpu", "remote"],
    minMemoryGb: "Optional lower-bound estimate; must be verified per workload",
    networkRequired: "Whether the app needs network access",
    dataSensitivity: ["public", "user", "sensitive"]
  }
};

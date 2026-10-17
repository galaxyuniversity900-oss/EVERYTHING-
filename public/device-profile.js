export function inspectDeviceCapabilities(nav = globalThis.navigator) {
  const rawMemory = Number(nav?.deviceMemory);
  const rawCores = Number(nav?.hardwareConcurrency);
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection || null;
  const memoryGb = Number.isFinite(rawMemory) && rawMemory > 0 && rawMemory <= 128 ? rawMemory : null;
  const cores = Number.isInteger(rawCores) && rawCores > 0 && rawCores <= 512 ? rawCores : null;
  const effectiveType = typeof connection?.effectiveType === "string" ? connection.effectiveType : null;
  const saveData = connection?.saveData === true;
  const slowNetwork = ["slow-2g", "2g", "3g"].includes(effectiveType);
  const lowMemory = memoryGb !== null && memoryGb <= 4;
  const lowCpu = cores !== null && cores <= 4;
  const constrained = lowMemory || lowCpu || saveData || slowNetwork;
  return {
    memoryGb,
    cores,
    effectiveType,
    saveData,
    online: nav?.onLine !== false,
    wasmAvailable: typeof WebAssembly === "object",
    webgpuAvailable: Boolean(nav?.gpu),
    lowMemory,
    lowCpu,
    constrainedNetwork: saveData || slowNetwork,
    constrained
  };
}

export function recommendRuntime(profile, server = {}) {
  if (!profile.online) return "browser";
  if (profile.constrained && server.remoteRuntimeConfigured) return "remote";
  if (profile.constrained) return "browser";
  return server.recommendedMode || (profile.webgpuAvailable ? "webgpu" : profile.wasmAvailable ? "wasm" : "browser");
}

export function describeDeviceProfile(profile, server = {}) {
  const specs = [];
  specs.push(profile.memoryGb === null ? "RAM estimate unavailable" : `browser-reported RAM ${profile.memoryGb} GB`);
  specs.push(profile.cores === null ? "CPU core count unavailable" : `${profile.cores} logical CPU cores`);
  if (profile.effectiveType) specs.push(`network ${profile.effectiveType}`);
  if (profile.saveData) specs.push("data-saver enabled");
  const recommendations = [];
  if (profile.lowMemory) recommendations.push("avoid large local LLMs and memory-heavy apps");
  if (profile.lowCpu) recommendations.push("keep parallel workloads low");
  if (profile.constrainedNetwork) recommendations.push("prefer lightweight assets and avoid high-bitrate streaming");
  if (!profile.webgpuAvailable) recommendations.push("WebGPU is not exposed; browser-side GPU inference may not be available");
  if (profile.constrained && server.remoteRuntimeConfigured && profile.online) recommendations.push("remote execution is available if the configured worker supports the app");
  if (profile.constrained && !server.remoteRuntimeConfigured) recommendations.push("use lightweight browser apps or a configured cloud AI provider; a remote app worker is not configured");
  if (!recommendations.length) recommendations.push("use measured app requirements; these signals do not guarantee that a model or app fits");
  return `Device profile: ${specs.join(" · ")}. ${recommendations.join("; ")}.`;
}

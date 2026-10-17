import { inspectDeviceCapabilities, recommendRuntime, describeDeviceProfile } from "./device-profile.js";

const modeLabel = document.querySelector("#runtime-mode");
const details = document.querySelector("#runtime-details");

async function reportCapabilities() {
  const profile = inspectDeviceCapabilities();
  let server = { remoteRuntimeConfigured: false, recommendedMode: "browser" };
  let serverReachable = false;
  try {
    const params = new URLSearchParams({
      wasm: profile.wasmAvailable ? "1" : "0",
      webgpu: profile.webgpuAvailable ? "1" : "0",
      network: profile.online ? "1" : "0"
    });
    const response = await fetch(`/api/runtime/capabilities?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Capability endpoint unavailable");
    server = await response.json();
    serverReachable = true;
  } catch {
    serverReachable = false;
  }

  const selectedMode = recommendRuntime(profile, server);
  const labels = {
    browser: profile.constrained ? "Low-resource browser mode" : "Browser-native execution",
    wasm: "WebAssembly-capable browser",
    webgpu: "WebGPU-capable browser",
    remote: "Configured remote runtime"
  };
  modeLabel.textContent = labels[selectedMode] || "Browser-native execution";

  const notes = [];
  if (serverReachable) {
    const available = (server.modes || []).filter((item) => item.available).map((item) => item.mode.toUpperCase());
    notes.push(`Runtime capabilities: ${available.join(", ") || "basic browser mode"}`);
    notes.push(server.remoteRuntimeConfigured ? "Remote session adapter is configured." : "Remote adapter exists, but no remote worker is configured.");
  } else {
    notes.push("Server capability API is unavailable; showing browser-local estimates only.");
  }
  notes.push(describeDeviceProfile(profile, server));
  notes.push("Browser hardware signals are approximate and do not guarantee that an app or model fits available memory or GPU.");
  details.textContent = notes.join(" ");
}

reportCapabilities();
window.addEventListener("online", reportCapabilities);
window.addEventListener("offline", reportCapabilities);
navigator.connection?.addEventListener?.("change", reportCapabilities);

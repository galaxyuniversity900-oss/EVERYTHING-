const modeLabel = document.querySelector("#runtime-mode");
const details = document.querySelector("#runtime-details");

async function reportCapabilities() {
  const wasm = typeof WebAssembly === "object";
  const webgpu = Boolean(navigator.gpu);
  const network = navigator.onLine !== false;
  const params = new URLSearchParams({ wasm: wasm ? "1" : "0", webgpu: webgpu ? "1" : "0", network: network ? "1" : "0" });
  try {
    const response = await fetch(`/api/runtime/capabilities?${params}`);
    if (!response.ok) throw new Error("Capability endpoint unavailable");
    const data = await response.json();
    const labels = { browser: "Browser-native execution", wasm: "WebAssembly-capable browser", webgpu: "WebGPU-capable browser", remote: "Remote execution" };
    modeLabel.textContent = labels[data.recommendedMode] || "Browser-native execution";
    const available = data.modes.filter((item) => item.available).map((item) => item.mode.toUpperCase());
    details.textContent = `Detected: ${available.join(", ")}. Remote app execution is not implemented. Browser support alone does not guarantee a workload will fit the device's memory or GPU.`;
  } catch {
    modeLabel.textContent = "Capability check unavailable";
    details.textContent = "The local server did not return capability information.";
  }
}
reportCapabilities();

const statusNode = document.querySelector("#mcp-status");
const toolsNode = document.querySelector("#mcp-tools");
const refreshButton = document.querySelector("#mcp-refresh");
const form = document.querySelector("#mcp-form");
const nameInput = document.querySelector("#mcp-tool-name");
const argsInput = document.querySelector("#mcp-arguments");
const confirmInput = document.querySelector("#mcp-confirm");
const outputNode = document.querySelector("#mcp-output");
const runButton = document.querySelector("#mcp-run");

function showOutput(value) {
  outputNode.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function renderTools(tools) {
  toolsNode.replaceChildren();
  if (!tools.length) {
    const empty = document.createElement("li");
    empty.textContent = "No tools were returned by the configured MCP server.";
    toolsNode.append(empty);
    return;
  }
  for (const tool of tools) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mcp-tool";
    button.textContent = tool.name;
    button.addEventListener("click", () => {
      nameInput.value = tool.name;
      showOutput({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
    });
    const description = document.createElement("p");
    description.textContent = tool.description || "No description provided.";
    item.append(button, description);
    toolsNode.append(item);
  }
}

async function loadTools() {
  refreshButton.disabled = true;
  statusNode.textContent = "Checking MCP server…";
  try {
    const statusResponse = await fetch("/api/mcp/status");
    const status = await statusResponse.json();
    if (!status.configured) {
      statusNode.textContent = status.setup || "No MCP server configured.";
      toolsNode.replaceChildren();
      return;
    }
    const response = await fetch("/api/mcp/tools");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "MCP tool discovery failed.");
    renderTools(data.tools || []);
    statusNode.textContent = `Connected to ${data.server?.name || "configured MCP server"} · ${(data.tools || []).length} tools discovered.`;
  } catch (error) {
    statusNode.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadTools);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showOutput("Select a tool from the list or enter a tool name.");
    return;
  }
  if (!confirmInput.checked) {
    showOutput("Confirmation is required. Review the selected tool and arguments first.");
    return;
  }
  let args;
  try {
    args = JSON.parse(argsInput.value || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
  } catch (error) {
    showOutput(error.message || "Arguments must be valid JSON.");
    return;
  }
  const approved = window.confirm(`Run MCP tool "${name}" with these arguments? Tool calls can have side effects.`);
  if (!approved) return;
  runButton.disabled = true;
  showOutput("Calling the configured MCP tool…");
  try {
    const response = await fetch("/api/mcp/tools/call", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name, arguments: args, confirmed: true })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "MCP tool call failed.");
    showOutput(data.result ?? data);
  } catch (error) {
    showOutput(error.message);
  } finally {
    runButton.disabled = false;
    confirmInput.checked = false;
  }
});

loadTools();

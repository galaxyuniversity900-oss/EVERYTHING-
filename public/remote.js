const statusNode = document.querySelector("#remote-status");
const appsNode = document.querySelector("#remote-apps");
const sessionsNode = document.querySelector("#remote-sessions");
const refreshButton = document.querySelector("#remote-refresh");

function renderApps(apps) {
  appsNode.replaceChildren();
  if (!apps.length) {
    const empty = document.createElement("p");
    empty.className = "remote-empty";
    empty.textContent = "The configured runtime has not advertised any launchable apps.";
    appsNode.append(empty);
    return;
  }
  for (const app of apps) {
    const card = document.createElement("article");
    card.className = "remote-app-card";
    const heading = document.createElement("h3");
    heading.textContent = app.name;
    const description = document.createElement("p");
    description.textContent = app.description || "No description provided by runtime.";
    const resources = document.createElement("p");
    resources.className = "remote-resources";
    if (app.resources) {
      const parts = [];
      if (app.resources.memory) parts.push(`RAM ${app.resources.memory}`);
      if (Number.isFinite(app.resources.cpus)) parts.push(`CPU ${app.resources.cpus}`);
      if (Number.isFinite(app.resources.gpus)) parts.push(`GPU ${app.resources.gpus}`);
      if (Number.isFinite(app.resources.pids)) parts.push(`PIDs ${app.resources.pids}`);
      resources.textContent = parts.length ? parts.join(" · ") : "Resource limits managed by runtime.";
    } else {
      resources.textContent = "Resource limits managed by runtime.";
    }
    const launch = document.createElement("button");
    launch.type = "button";
    launch.className = "remote-launch";
    launch.textContent = "Launch remote ↗";
    launch.addEventListener("click", () => launchApp(app));
    card.append(heading, description, resources, launch);
    appsNode.append(card);
  }
}

function renderSession(session) {
  const card = document.createElement("article");
  card.className = "remote-session-card";
  const label = document.createElement("strong");
  label.textContent = `Session: ${session.appId}`;
  const link = document.createElement("a");
  link.href = session.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open remote session ↗";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "remote-close";
  close.textContent = "Close session";
  close.addEventListener("click", async () => {
    if (!window.confirm("Close this remote session? Unsaved work in the remote app may be lost.")) return;
    close.disabled = true;
    try {
      const response = await fetch("/api/runtime/remote/sessions/close", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ id: session.id, confirmed: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Could not close the remote session.");
      card.remove();
    } catch (error) {
      statusNode.textContent = error.message;
      close.disabled = false;
    }
  });
  card.append(label, link, close);
  sessionsNode.prepend(card);
}

async function launchApp(app) {
  if (!window.confirm(`Create a remote session for "${app.name}"? The remote runtime may use compute resources or incur costs.`)) return;
  statusNode.textContent = `Requesting a remote session for ${app.name}…`;
  try {
    const response = await fetch("/api/runtime/remote/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ appId: app.id, confirmed: true })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Remote session could not be created.");
    renderSession(data);
    statusNode.textContent = `Remote session created for ${app.name}. Open it in a new tab.`;
  } catch (error) {
    statusNode.textContent = error.message;
  }
}

async function loadRemoteApps() {
  refreshButton.disabled = true;
  statusNode.textContent = "Checking configured remote runtime…";
  try {
    const statusResponse = await fetch("/api/runtime/remote/status");
    const status = await statusResponse.json();
    if (!status.configured) {
      statusNode.textContent = status.setup || "No remote runtime configured.";
      appsNode.replaceChildren();
      return;
    }
    const response = await fetch("/api/runtime/remote/apps");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Remote runtime discovery failed.");
    renderApps(data.apps || []);
    statusNode.textContent = `Connected to ${data.provider}. ${(data.apps || []).length} launchable apps advertised.`;
  } catch (error) {
    statusNode.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadRemoteApps);
loadRemoteApps();

const $ = (selector) => document.querySelector(selector);
const appGrid = $("#apps");
const filterBar = $("#filters");
const searchInput = $("#search");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const compactToggle = $("#compact-mode");
const installButton = $("#install-app");
const STORAGE_KEY = "everything.workspace.v1";
const MAX_RECENT = 12;
let activeCategory = "All";
let activeView = "all";
let debounceTimer;
let installPrompt = null;
let catalogApps = [];
let preferences = loadPreferences();

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      favorites: Array.isArray(saved.favorites) ? saved.favorites.filter((id) => typeof id === "string").slice(0, 200) : [],
      recent: Array.isArray(saved.recent) ? saved.recent.filter((id) => typeof id === "string").slice(0, MAX_RECENT) : [],
      compact: saved.compact === true
    };
  } catch {
    return { favorites: [], recent: [], compact: false };
  }
}

function savePreferences() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Private browsing or full storage: keep this session usable. */ }
  updateWorkspaceControls();
}

function updateWorkspaceControls() {
  $("#favorite-count").textContent = String(preferences.favorites.length);
  compactToggle.checked = preferences.compact;
  document.body.classList.toggle("compact-mode", preferences.compact);
  viewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === activeView)));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderFilters(categories) {
  filterBar.innerHTML = categories.map((category) =>
    `<button class="filter" type="button" data-category="${escapeHtml(category)}" aria-pressed="${category === activeCategory}">${escapeHtml(category)}</button>`
  ).join("");
}

function getVisibleApps(apps) {
  if (activeView === "favorites") return apps.filter((app) => preferences.favorites.includes(app.id));
  if (activeView === "recent") {
    const byId = new Map(apps.map((app) => [app.id, app]));
    return preferences.recent.map((id) => byId.get(id)).filter(Boolean);
  }
  return apps;
}

function renderApps(apps) {
  const visible = getVisibleApps(apps);
  if (!visible.length) {
    const message = activeView === "favorites" ? "No favorites yet. Tap ★ on an app to pin it here."
      : activeView === "recent" ? "Recently opened apps will appear here on this device."
      : "No applications match this search. Try another term or category.";
    appGrid.innerHTML = `<p class="empty">${message}</p>`;
    return;
  }
  appGrid.innerHTML = visible.map((app) => {
    const initial = escapeHtml(app.name.slice(0, 1).toUpperCase());
    const primaryLabel = app.hosted ? "Open app ↗" : "View source ↗";
    const favorite = preferences.favorites.includes(app.id);
    const sourceLink = app.hosted ? `<a href="${escapeHtml(app.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : "";
    return `<article class="app-card">
      <div class="app-top"><span class="app-icon" aria-hidden="true">${initial}</span><div class="app-top-actions"><span class="app-category">${escapeHtml(app.category)}</span><button class="favorite-button" type="button" data-favorite="${escapeHtml(app.id)}" aria-pressed="${favorite}" aria-label="${favorite ? "Remove from" : "Add to"} favorites">${favorite ? "★" : "☆"}</button></div></div>
      <h3>${escapeHtml(app.name)}</h3><p>${escapeHtml(app.description)}</p>
      <div class="app-actions"><a data-launch="${escapeHtml(app.id)}" href="${escapeHtml(app.url)}" target="_blank" rel="noopener noreferrer">${primaryLabel}</a>${sourceLink}</div>
    </article>`;
  }).join("");
}

function rememberApp(id) {
  preferences.recent = [id, ...preferences.recent.filter((item) => item !== id)].slice(0, MAX_RECENT);
  savePreferences();
}

async function loadApps() {
  appGrid.innerHTML = '<p class="empty">Loading applications…</p>';
  const params = new URLSearchParams({ category: activeCategory, q: searchInput.value });
  try {
    const response = await fetch(`/api/apps?${params}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("catalog_request_failed");
    const data = await response.json();
    catalogApps = data.apps;
    renderFilters(data.categories);
    renderApps(catalogApps);
    $("#app-count").textContent = `${getVisibleApps(catalogApps).length} apps in this view`;
  } catch {
    appGrid.innerHTML = '<p class="empty">The app catalog is unavailable offline. Previously cached catalog queries may still be available after the first successful load.</p>';
    $("#app-count").textContent = "Catalog unavailable";
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("health_check_failed");
    const data = await response.json();
    $("#health-dot").classList.add("ok");
    $("#health-label").textContent = `Core online · v${data.version}`;
  } catch {
    $("#health-label").textContent = "Core status unavailable";
  }
}

filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  loadApps();
});

appGrid.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("button[data-favorite]");
  if (favoriteButton) {
    const id = favoriteButton.dataset.favorite;
    preferences.favorites = preferences.favorites.includes(id)
      ? preferences.favorites.filter((item) => item !== id)
      : [...preferences.favorites, id].slice(-200);
    savePreferences();
    renderApps(catalogApps);
    return;
  }
  const launch = event.target.closest("a[data-launch]");
  if (launch) rememberApp(launch.dataset.launch);
});

viewButtons.forEach((button) => button.addEventListener("click", () => {
  activeView = button.dataset.view;
  updateWorkspaceControls();
  renderApps(catalogApps);
  $("#app-count").textContent = `${getVisibleApps(catalogApps).length} apps in this view`;
}));

compactToggle.addEventListener("change", () => {
  preferences.compact = compactToggle.checked;
  savePreferences();
});

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadApps, 160);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
});

updateWorkspaceControls();
await Promise.all([loadApps(), checkHealth()]);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

const $ = (selector) => document.querySelector(selector);
const appGrid = $("#apps");
const filterBar = $("#filters");
const searchInput = $("#search");
let activeCategory = "All";
let debounceTimer;

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

function renderApps(apps) {
  if (!apps.length) {
    appGrid.innerHTML = '<p class="empty">No applications match this search. Try another term or category.</p>';
    return;
  }
  appGrid.innerHTML = apps.map((app) => {
    const initial = escapeHtml(app.name.slice(0, 1).toUpperCase());
    return `<article class="app-card">
      <div class="app-top"><span class="app-icon" aria-hidden="true">${initial}</span><span class="app-category">${escapeHtml(app.category)}</span></div>
      <h3>${escapeHtml(app.name)}</h3><p>${escapeHtml(app.description)}</p>
      <div class="app-actions"><a href="${escapeHtml(app.url)}" target="_blank" rel="noopener noreferrer">Open app ↗</a><a href="${escapeHtml(app.source)}" target="_blank" rel="noopener noreferrer">Source</a></div>
    </article>`;
  }).join("");
}

async function loadApps() {
  appGrid.innerHTML = '<p class="empty">Loading applications…</p>';
  const params = new URLSearchParams({ category: activeCategory, q: searchInput.value });
  try {
    const response = await fetch(`/api/apps?${params}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("catalog_request_failed");
    const data = await response.json();
    renderFilters(data.categories);
    renderApps(data.apps);
    $("#app-count").textContent = `${data.count} apps in this view`;
  } catch {
    appGrid.innerHTML = '<p class="empty">The app catalog could not be loaded. Check that the local server is running, then refresh.</p>';
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

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadApps, 160);
});

await Promise.all([loadApps(), checkHealth()]);

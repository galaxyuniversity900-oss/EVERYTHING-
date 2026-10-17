import { MAX_WORKSPACE_ITEMS, MAX_ITEM_CONTENT, normalizeWorkspaceItem, validateWorkspaceImport } from "./workspace-core.js";

const dbName = "everything-local-workspace";
const storeName = "items";
const form = document.querySelector("#workspace-form");
const titleInput = document.querySelector("#workspace-title-input");
const typeInput = document.querySelector("#workspace-type");
const contentInput = document.querySelector("#workspace-content");
const searchInput = document.querySelector("#workspace-search");
const listNode = document.querySelector("#workspace-items");
const statusNode = document.querySelector("#workspace-status");
const importInput = document.querySelector("#workspace-import");
const saveButton = document.querySelector("#workspace-save");
let db;
let editingId = null;
let items = [];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local database request failed."));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Local database transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local database transaction was aborted."));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support IndexedDB local storage."));
      return;
    }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local workspace."));
  });
}

async function getAllItems() {
  const tx = db.transaction(storeName, "readonly");
  const done = transactionComplete(tx);
  const result = await requestResult(tx.objectStore(storeName).getAll());
  await done;
  return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function putItem(item) {
  const tx = db.transaction(storeName, "readwrite");
  const done = transactionComplete(tx);
  await Promise.all([requestResult(tx.objectStore(storeName).put(item)), done]);
}

async function deleteItem(id) {
  const tx = db.transaction(storeName, "readwrite");
  const done = transactionComplete(tx);
  await Promise.all([requestResult(tx.objectStore(storeName).delete(id)), done]);
}

function resetEditor() {
  editingId = null;
  form.reset();
  typeInput.value = "note";
  saveButton.textContent = "Save locally";
}

function setStatus(message) {
  statusNode.textContent = message;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderItems() {
  listNode.replaceChildren();
  const query = searchInput.value.trim().toLowerCase();
  const filtered = items.filter((item) => !query || `${item.title} ${item.content} ${item.type}`.toLowerCase().includes(query));
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "workspace-empty";
    empty.textContent = query ? "No local items match this search." : "Nothing saved on this device yet.";
    listNode.append(empty);
    return;
  }
  for (const item of filtered) {
    const card = document.createElement("article");
    card.className = "workspace-item";
    const top = document.createElement("div");
    top.className = "workspace-item-top";
    const heading = document.createElement("h3");
    heading.textContent = item.title;
    const badge = document.createElement("span");
    badge.className = "workspace-type";
    badge.textContent = item.type;
    top.append(heading, badge);
    const preview = document.createElement("p");
    preview.textContent = item.content.slice(0, 220) || "Empty item";
    const actions = document.createElement("div");
    actions.className = "workspace-item-actions";
    actions.append(
      makeButton("Edit", "workspace-secondary", () => {
        editingId = item.id;
        titleInput.value = item.title;
        typeInput.value = item.type;
        contentInput.value = item.content;
        saveButton.textContent = "Update locally";
        titleInput.focus();
      }),
      makeButton("Use with AI", "workspace-secondary", () => {
        const aiInput = document.querySelector("#ai-input");
        if (aiInput) {
          aiInput.value = item.content;
          document.querySelector("#ai-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
          aiInput.focus();
          setStatus("Item copied into the AI input. It will not be sent until you press Send.");
        }
      }),
      makeButton("Delete", "workspace-danger", async () => {
        if (!window.confirm(`Delete "${item.title}" from this browser's local workspace?`)) return;
        try {
          await deleteItem(item.id);
          items = await getAllItems();
          if (editingId === item.id) resetEditor();
          renderItems();
          setStatus("Deleted from this browser.");
        } catch (error) { setStatus(error.message); }
      })
    );
    card.append(top, preview, actions);
    listNode.append(card);
  }
}

async function refreshItems() {
  items = await getAllItems();
  renderItems();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = contentInput.value;
  if (content.length > MAX_ITEM_CONTENT) {
    setStatus("Content is too long to save.");
    return;
  }
  try {
    if (!editingId && items.length >= MAX_WORKSPACE_ITEMS) {
      setStatus(`This browser workspace is limited to ${MAX_WORKSPACE_ITEMS} items. Export a backup or delete an item first.`);
      return;
    }
    const existing = editingId ? items.find((item) => item.id === editingId) : null;
    const item = normalizeWorkspaceItem({
      id: editingId || undefined,
      title: titleInput.value,
      type: typeInput.value,
      content,
      createdAt: existing?.createdAt
    });
    await putItem(item);
    await refreshItems();
    resetEditor();
    setStatus("Saved locally in this browser. No data was sent to the server.");
  } catch (error) { setStatus(error.message); }
});

document.querySelector("#workspace-new").addEventListener("click", resetEditor);
searchInput.addEventListener("input", renderItems);

document.querySelector("#workspace-export").addEventListener("click", async () => {
  try {
    const data = await getAllItems();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `everything-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${data.length} item(s) to a JSON backup.`);
  } catch (error) { setStatus(error.message); }
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("Import file must be smaller than 2 MiB.");
    const parsed = JSON.parse(await file.text());
    const existing = await getAllItems();
    const imported = validateWorkspaceImport(parsed, { existingIds: new Set(existing.map((item) => item.id)) });
    const combined = new Map(existing.map((item) => [item.id, item]));
    for (const item of imported) combined.set(item.id, item);
    if (combined.size > MAX_WORKSPACE_ITEMS) throw new Error(`Import would exceed ${MAX_WORKSPACE_ITEMS} local items. Export and remove some items first.`);
    const tx = db.transaction(storeName, "readwrite");
    const done = transactionComplete(tx);
    const store = tx.objectStore(storeName);
    for (const item of imported) store.put(item);
    await done;
    await refreshItems();
    setStatus(`Imported ${imported.length} item(s). Data remains in this browser.`);
  } catch (error) {
    setStatus(error.message || "Import failed.");
  } finally {
    importInput.value = "";
  }
});

try {
  db = await openDatabase();
  await refreshItems();
  setStatus("Local workspace ready. Items stay in this browser until you export them.");
} catch (error) {
  form.querySelectorAll("input, select, textarea, button").forEach((element) => { element.disabled = true; });
  importInput.disabled = true;
  document.querySelector("#workspace-export").disabled = true;
  setStatus(error.message);
}

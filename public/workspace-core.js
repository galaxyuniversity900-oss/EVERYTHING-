export const WORKSPACE_TYPES = new Set(["note", "prompt", "snippet"]);
export const MAX_WORKSPACE_ITEMS = 200;
export const MAX_ITEM_CONTENT = 100_000;

export function normalizeWorkspaceItem(input, { idFactory = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`, now = () => new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Workspace item must be an object");
  }
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const content = typeof input.content === "string" ? input.content : "";
  const type = WORKSPACE_TYPES.has(input.type) ? input.type : "note";
  if (!title) throw new TypeError("Title is required");
  if (content.length > MAX_ITEM_CONTENT) throw new RangeError("Content exceeds the 100000 character limit");
  return {
    id: typeof input.id === "string" && input.id.length <= 160 ? input.id : idFactory(),
    title,
    type,
    content,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now(),
    updatedAt: now()
  };
}

export function validateWorkspaceImport(input, options = {}) {
  if (!Array.isArray(input)) throw new TypeError("Import file must contain a JSON array");
  if (input.length > MAX_WORKSPACE_ITEMS) throw new RangeError(`Import can contain at most ${MAX_WORKSPACE_ITEMS} items`);
  const seen = new Set();
  return input.map((raw) => {
    const item = normalizeWorkspaceItem(raw, options);
    if (seen.has(item.id)) item.id = options.idFactory ? options.idFactory() : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    seen.add(item.id);
    return item;
  });
}

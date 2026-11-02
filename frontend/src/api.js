export const API_BASE = (
  import.meta.env.VITE_API_URL || "https://kodigo-backend.onrender.com"
).replace(/\/$/, "");

export function resolveUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  chats: (limit = 200, offset = 0) => req(`/api/chats?limit=${limit}&offset=${offset}`),
  newChat: () => req("/api/chats", { method: "POST" }),
  pinChat: (id, is_pinned) => req(`/api/chats/${id}`, json("PATCH", { is_pinned })),
  renameChat: (id, title) => req(`/api/chats/${id}`, json("PATCH", { title })),
  exportChat: (id) => req(`/api/chats/${id}/export`),
  importChat: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/api/chats/import", { method: "POST", body: f });
  },
  delChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  batchChats: (chat_ids) => req("/api/chats/batch", json("POST", { chat_ids })),
  messages: (id, limit = 200, offset = 0) => req(`/api/chats/${id}/messages?limit=${limit}&offset=${offset}`),
  send: (id, content, mode, file, clientOcrText = "") => {
    const f = new FormData();
    f.append("content", content);
    f.append("mode", mode);
    if (file) f.append("image", file);
    if (clientOcrText) f.append("client_ocr_text", clientOcrText);
    return req(`/api/chats/${id}/messages`, { method: "POST", body: f });
  },
  explain: (mid, item = null) => req(`/api/messages/${mid}/explain`, json("POST", { item })),
  settings: () => req("/api/settings"),
  saveSettings: (s) => req("/api/settings", json("PUT", s)),
  models: (options) => req("/api/models", json("POST", options)),
  // refs: scope = "universal" or a chat id
  refs: (scope) => req(scope === "universal" ? "/api/universal-references" : `/api/chats/${scope}/references`),
  addRef: (scope, file) => {
    const f = new FormData(); f.append("file", file);
    return req(scope === "universal" ? "/api/universal-references" : `/api/chats/${scope}/references`, { method: "POST", body: f });
  },
  toggleRef: (scope, id, is_active) =>
    req(scope === "universal" ? `/api/universal-references/${id}` : `/api/references/${id}`, json("PATCH", { is_active })),
  delRef: (scope, id) =>
    req(scope === "universal" ? `/api/universal-references/${id}` : `/api/references/${id}`, { method: "DELETE" }),
};

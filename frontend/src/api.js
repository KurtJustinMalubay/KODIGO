async function req(url, opts = {}) {
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
  delChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  batchChats: (chat_ids) => req("/api/chats/batch", json("POST", { chat_ids })),
  messages: (id, limit = 200, offset = 0) => req(`/api/chats/${id}/messages?limit=${limit}&offset=${offset}`),
  send: (id, content, mode, file) => {
    const f = new FormData();
    f.append("content", content); f.append("mode", mode);
    if (file) f.append("image", file);
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

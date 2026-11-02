export const API_BASE = (
  import.meta.env.VITE_API_URL || "https://kodigo-backend.onrender.com"
).replace(/\/$/, "");

const SETTINGS_KEY = "kodigo_device_settings";

export function getLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load settings from localStorage:", e);
  }
  return null;
}

export function saveLocalSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings to localStorage:", e);
  }
}

export function resolveUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function req(path, opts = {}) {
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // Attach per-device credentials so requests are isolated to this device
  const local = getLocalSettings();
  const headers = { ...(opts.headers || {}) };
  if (local) {
    if (local.cloud_api_key) headers["x-cloud-api-key"] = local.cloud_api_key;
    if (local.provider) headers["x-ai-provider"] = local.provider;
    if (local.model_name) headers["x-model-name"] = local.model_name;
    if (local.ollama_url) headers["x-ollama-url"] = local.ollama_url;
    if (local.ocr_provider) headers["x-ocr-provider"] = local.ocr_provider;
  }

  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  chats: (limit = 200, offset = 0) =>
    req(`/api/chats?limit=${limit}&offset=${offset}`),
  newChat: () => req("/api/chats", { method: "POST" }),
  pinChat: (id, is_pinned) =>
    req(`/api/chats/${id}`, json("PATCH", { is_pinned })),
  renameChat: (id, title) =>
    req(`/api/chats/${id}`, json("PATCH", { title })),
  exportChat: (id) => req(`/api/chats/${id}/export`),
  importChat: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/api/chats/import", { method: "POST", body: f });
  },
  delChat: (id) => req(`/api/chats/${id}`, { method: "DELETE" }),
  batchChats: (chat_ids) => req("/api/chats/batch", json("POST", { chat_ids })),
  messages: (id, limit = 200, offset = 0) =>
    req(`/api/chats/${id}/messages?limit=${limit}&offset=${offset}`),
  send: (id, content, mode, file, clientOcrText = "") => {
    const f = new FormData();
    f.append("content", content);
    f.append("mode", mode);
    if (file) f.append("image", file);
    if (clientOcrText) f.append("client_ocr_text", clientOcrText);
    return req(`/api/chats/${id}/messages`, { method: "POST", body: f });
  },
  explain: (mid, item = null) =>
    req(`/api/messages/${mid}/explain`, json("POST", { item })),

  // Device-isolated settings: priority given to device's localStorage
  settings: async () => {
    const local = getLocalSettings();
    if (local && local.setup_complete) {
      return local;
    }
    try {
      const server = await req("/api/settings");
      return { ...server, ...(local || {}) };
    } catch {
      return (
        local || {
          provider: "gemini",
          model_name: "gemini-2.0-flash",
          ollama_url: "http://localhost:11434",
          cloud_api_key: "",
          ocr_provider: "paddleocr",
          default_mode: "quiz",
          font_size: "medium",
          theme: "dark",
          setup_complete: false,
        }
      );
    }
  },
  saveSettings: async (s) => {
    saveLocalSettings(s);
    try {
      await req("/api/settings", json("PUT", s));
    } catch {}
    return s;
  },
  models: (options) => {
    const local = getLocalSettings();
    const payload = {
      provider: options.provider || local?.provider || "gemini",
      cloud_api_key: options.cloud_api_key || local?.cloud_api_key || "",
      ollama_url: options.ollama_url || local?.ollama_url || "http://localhost:11434",
    };
    return req("/api/models", json("POST", payload));
  },
  // refs: scope = "universal" or a chat id
  refs: (scope) =>
    req(
      scope === "universal"
        ? "/api/universal-references"
        : `/api/chats/${scope}/references`
    ),
  addRef: (scope, file) => {
    const f = new FormData();
    f.append("file", file);
    return req(
      scope === "universal"
        ? "/api/universal-references"
        : `/api/chats/${scope}/references`,
      { method: "POST", body: f }
    );
  },
  toggleRef: (scope, id, is_active) =>
    req(
      scope === "universal"
        ? `/api/universal-references/${id}`
        : `/api/references/${id}`,
      json("PATCH", { is_active })
    ),
  delRef: (scope, id) =>
    req(
      scope === "universal"
        ? `/api/universal-references/${id}`
        : `/api/references/${id}`,
      { method: "DELETE" }
    ),
};

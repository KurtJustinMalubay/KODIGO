import { localDB } from "./db";

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
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
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

/**
 * Local-First API Client:
 * All chats, messages, references, and settings are stored directly
 * on the user's device via IndexedDB and localStorage for 100% data persistency.
 * Render backend functions as a stateless compute/AI/OCR engine.
 */
export const api = {
  // === CHATS (Local-First IndexedDB) ===
  chats: async () => {
    return await localDB.getChats();
  },

  newChat: async (title = "New Chat") => {
    return await localDB.createChat(title);
  },

  pinChat: async (id, is_pinned) => {
    return await localDB.updateChat(id, { is_pinned });
  },

  renameChat: async (id, title) => {
    return await localDB.updateChat(id, { title });
  },

  delChat: async (id) => {
    return await localDB.deleteChat(id);
  },

  // === MESSAGES (Local-First IndexedDB) ===
  messages: async (id) => {
    return await localDB.getMessages(id);
  },

  // === AI INFERENCE (Stateless Backend Call + Local Persistence) ===
  send: async (id, content, mode, file, clientOcrText = "") => {
    // 1. Gather recent conversation history from local database
    const localMsgs = await localDB.getMessages(id);
    const history = localMsgs.slice(-10).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.content,
    }));

    // 2. Gather active references context text from local database
    const contextText = await localDB.buildContextText(id);

    // 3. Prepare payload for Render stateless AI compute
    const f = new FormData();
    f.append("content", content);
    f.append("mode", mode);
    if (file) f.append("image", file);
    if (clientOcrText) f.append("client_ocr_text", clientOcrText);
    f.append("history_json", JSON.stringify(history));
    f.append("context_text", contextText);

    // 4. Request AI inference from Render backend
    const result = await req(`/api/chats/${id}/messages`, {
      method: "POST",
      body: f,
    });

    // 5. Persist both user message and AI message directly into local device IndexedDB
    const savedUser = await localDB.addMessage({
      chat_id: id,
      sender: "user",
      mode: result.user?.mode || mode,
      content: result.user?.content || content,
      image_path: result.user?.image_path || null,
      created_at: new Date().toISOString(),
    });

    const savedAi = await localDB.addMessage({
      chat_id: id,
      sender: "ai",
      mode: result.ai?.mode || mode,
      content: result.ai?.content || "",
      created_at: new Date().toISOString(),
    });

    // Update chat title if it's the first message
    const chat = await localDB.getChat(id);
    if (chat && (chat.title === "New Chat" || !chat.title)) {
      const newTitle = (content || "Image Question").slice(0, 40);
      await localDB.updateChat(id, {
        title: newTitle,
        updated_at: new Date().toISOString(),
      });
    } else if (chat) {
      await localDB.updateChat(id, { updated_at: new Date().toISOString() });
    }

    return {
      user: savedUser,
      ai: savedAi,
      mode: result.mode || mode,
    };
  },

  explain: async (mid, item = null, aiMessage = null) => {
    let questionContent = "";
    let answerContent = aiMessage?.content || "";
    let contextText = "";

    if (aiMessage?.chat_id) {
      const msgs = await localDB.getMessages(aiMessage.chat_id);
      const userMsg = [...msgs]
        .reverse()
        .find((m) => m.sender === "user" && m.id < mid);
      if (userMsg) questionContent = userMsg.content;
      contextText = await localDB.buildContextText(aiMessage.chat_id);
    }

    const res = await req(
      `/api/messages/${mid}/explain`,
      json("POST", {
        item,
        question_content: questionContent,
        answer_content: answerContent,
        context_text: contextText,
      })
    );

    if (item === null && res?.explanation) {
      await localDB.updateMessage(mid, {
        has_explanation: true,
        detailed_explanation: res.explanation,
      });
    }

    return res;
  },

  // === IMPORT & EXPORT (.kod format directly on device) ===
  exportChat: async (id) => {
    const chat = await localDB.getChat(id);
    const msgs = await localDB.getMessages(id);
    return {
      kodigo_version: "1.0",
      format: "kod",
      exported_at: new Date().toISOString(),
      chat: {
        title: chat?.title || "Chat",
        is_pinned: chat?.is_pinned || false,
        created_at: chat?.created_at,
      },
      messages: msgs.map((m) => ({
        sender: m.sender,
        mode: m.mode,
        content: m.content,
        image_path: m.image_path,
        has_explanation: m.has_explanation,
        detailed_explanation: m.detailed_explanation,
        created_at: m.created_at,
      })),
    };
  },

  importChat: async (file) => {
    const text = await file.text();
    const data = JSON.parse(text);

    const chatData = data.chat || {};
    const rawTitle = chatData.title || file.name.replace(/\.[^/.]+$/, "") || "Imported Chat";
    const newChat = await localDB.createChat(rawTitle);

    if (chatData.is_pinned) {
      await localDB.updateChat(newChat.id, { is_pinned: true });
      newChat.is_pinned = true;
    }

    const messagesData = data.messages || [];
    const savedMessages = [];
    for (const msg of messagesData) {
      const saved = await localDB.addMessage({
        chat_id: newChat.id,
        sender: msg.sender || "user",
        mode: msg.mode || "quiz",
        content: msg.content || "",
        image_path: msg.image_path || null,
        has_explanation: !!msg.has_explanation,
        detailed_explanation: msg.detailed_explanation || null,
        created_at: msg.created_at || new Date().toISOString(),
      });
      savedMessages.push(saved);
    }

    return { chat: newChat, messages: savedMessages };
  },

  // === REFERENCES (Local-First IndexedDB) ===
  refs: async (scope) => {
    return await localDB.getReferences(scope);
  },

  addRef: async (scope, file) => {
    let extractedText = "";

    // If text file, read on device immediately
    if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      extractedText = await file.text();
    } else {
      // Send to backend text extractor
      try {
        const f = new FormData();
        f.append("file", file);
        const res = await req("/api/universal-references", {
          method: "POST",
          body: f,
        });
        extractedText = res?.extracted_text || "";
      } catch (err) {
        console.warn("Server OCR extraction error:", err);
      }
    }

    return await localDB.addReference(scope, file.name, extractedText);
  },

  toggleRef: async (scope, id, is_active) => {
    return await localDB.toggleReference(id, is_active);
  },

  delRef: async (scope, id) => {
    return await localDB.deleteReference(id);
  },

  // === SETTINGS (Device-isolated in localStorage) ===
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
};

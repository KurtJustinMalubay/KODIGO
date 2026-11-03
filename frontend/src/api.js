import { localDB } from "./db";
import { extractTextOnDevice } from "./utils/imageOptimizer";

let rawBase = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "https://kodigo-backend.justinkurt837.workers.dev"
)
  .trim()
  .replace(/\/$/, "");

if (!rawBase.startsWith("http://") && !rawBase.startsWith("https://")) {
  rawBase = `https://${rawBase}`;
}

export const API_BASE_URL = rawBase;

export const API_BASE = API_BASE_URL;

export async function sendChatMessage(prompt, customApiKey = null) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (customApiKey) {
    headers["X-Custom-API-Key"] = customApiKey;
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to communicate with API.");
  }

  return await response.json();
}

const SETTINGS_KEY = "kodigo_device_settings";

export const DEFAULT_SETTINGS = {
  provider: "gemini",
  model_name: "gemini-3.5-flash-lite",
  ollama_url: "http://localhost:11434",
  cloud_api_key: "",
  key_mode: "free", // "free" = built-in free tier, "custom" = user custom key
  ocr_provider: "paddleocr",
  default_mode: "quiz",
  font_size: "medium",
  theme: "dark",
  setup_complete: false,
};

export function getLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_SETTINGS, ...parsed };

      // Migrate stale model names (pre-v3.5-lite model) back to recommended for free tier
      const staleModel =
        merged.model_name &&
        (merged.model_name.includes("gemini-1.") ||
          merged.model_name.includes("gemini-2.") ||
          merged.model_name.includes("3.5") ||
          merged.model_name === "gemini-3.8-flash" ||
          merged.model_name === "gemini-3.8-flash-lite");
      if (staleModel && (merged.key_mode === "free" || !merged.cloud_api_key)) {
        merged.model_name = "gemini-3.5-flash-lite";
      }

      return merged;
    }
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
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
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
    // Only send custom key if in custom mode or if user has entered one and not in free mode
    if (local.key_mode === "custom" && local.cloud_api_key) {
      headers["x-cloud-api-key"] = local.cloud_api_key;
      headers["x-custom-api-key"] = local.cloud_api_key;
    } else if (local.key_mode !== "free" && local.cloud_api_key) {
      headers["x-cloud-api-key"] = local.cloud_api_key;
      headers["x-custom-api-key"] = local.cloud_api_key;
    }
    if (local.provider) headers["x-ai-provider"] = local.provider;
    if (local.model_name) headers["x-model-name"] = local.model_name;
    if (local.ollama_url) headers["x-ollama-url"] = local.ollama_url;
    if (local.ocr_provider) headers["x-ocr-provider"] = local.ocr_provider;
  }

  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const errJson = await r.json();
      msg = errJson.detail || errJson.message || msg;
    } catch {
      try {
        const errText = await r.text();
        if (errText) msg = errText;
      } catch {}
    }
    throw new Error(msg);
  }

  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return r.json();
  }
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid server response from ${url}.`);
  }
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * 100% Local-First Architecture:
 * - Chats, messages, references, images, and settings are stored entirely on the user's device (IndexedDB + localStorage).
 * - OnRender backend functions strictly as a stateless compute engine for AI generation and OCR.
 * - ZERO user data is stored on or lost by OnRender redeployments, restarts, or updates.
 */
export const api = {
  // === CHATS (Local-First IndexedDB) ===
  chats: async () => {
    return await localDB.getChats();
  },

  newChat: async (title = "New Chat", isTutor = false) => {
    return await localDB.createChat(title, isTutor);
  },

  newTutorChat: async (title = "New Tutoring Session") => {
    return await localDB.createChat(title, true);
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
  send: async (id, content, mode, file, clientOcrText = "", subjectFilter = null) => {
    // 1. Gather recent conversation history from local database
    const localMsgs = await localDB.getMessages(id);
    const history = localMsgs.slice(-10).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.content,
    }));

    // 2. Gather active references and academic profile context from local database
    let contextText = await localDB.buildContextText(id);
    if (mode === "tutor") {
      const academicCtx = await localDB.buildAcademicContext(subjectFilter);
      if (academicCtx) {
        contextText = contextText
          ? `${academicCtx}\n\n${contextText}`
          : academicCtx;
      }
    }

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

    // 5. Convert image to Data URL on client so it persists permanently in IndexedDB even if Render disk resets
    let localImagePath = result.user?.image_path || null;
    if (file) {
      try {
        localImagePath = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(result.user?.image_path || null);
          reader.readAsDataURL(file);
        });
      } catch (e) {
        console.warn("Failed to create local image data URL:", e);
      }
    }

    // 6. Persist both user message and AI message directly into local device IndexedDB
    const savedUser = await localDB.addMessage({
      chat_id: id,
      sender: "user",
      mode: result.user?.mode || mode,
      content: result.user?.content || content,
      image_path: localImagePath,
      created_at: new Date().toISOString(),
    });

    const aiContent =
      result?.ai?.content ||
      result?.content ||
      result?.reply ||
      result?.message ||
      "";
    const savedAi = await localDB.addMessage({
      chat_id: id,
      sender: "ai",
      mode: result?.ai?.mode || result?.mode || mode,
      content: aiContent,
      created_at: new Date().toISOString(),
    });

    // Update chat title if it's the first message
    const chat = await localDB.getChat(id);
    if (chat && (chat.title === "New Chat" || chat.title === "New Tutor Session" || !chat.title)) {
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

  // === REFERENCES (100% Device-Local in IndexedDB) ===
  refs: async (scope) => {
    return await localDB.getReferences(scope);
  },

  addRef: async (scope, file) => {
    let extractedText = "";

    // 1. Text/code files: read instantly on device
    if (
      file.type.startsWith("text/") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".json")
    ) {
      extractedText = await file.text();
    } else if (file.type.startsWith("image/")) {
      // 2. Image: run OCR on device first for 0ms lag & zero server dependency
      try {
        extractedText = await extractTextOnDevice(file);
      } catch (e) {
        console.warn("Client OCR fallback:", e);
      }
      // If client OCR yielded nothing or failed, request stateless text extraction
      if (!extractedText.trim()) {
        try {
          const f = new FormData();
          f.append("file", file);
          const res = await req("/api/extract-text", {
            method: "POST",
            body: f,
          });
          extractedText = res?.extracted_text || "";
        } catch (err) {
          console.warn("Stateless OCR extraction fallback:", err);
        }
      }
    } else {
      // 3. PDFs or other documents: send to stateless text extractor
      try {
        const f = new FormData();
        f.append("file", file);
        const res = await req("/api/extract-text", {
          method: "POST",
          body: f,
        });
        extractedText = res?.extracted_text || "";
      } catch (err) {
        console.warn("Text extraction error:", err);
      }
    }

    // Save directly into local device IndexedDB — NEVER lost when Render deploys!
    return await localDB.addReference(scope, file.name, extractedText);
  },

  toggleRef: async (scope, id, is_active) => {
    return await localDB.toggleReference(id, is_active);
  },

  delRef: async (scope, id) => {
    return await localDB.deleteReference(id);
  },

  // === SETTINGS (100% Device-Local in localStorage — Never wiped by Render) ===
  getSettingsSync: () => {
    const local = getLocalSettings();
    if (local) return local;
    return { ...DEFAULT_SETTINGS };
  },

  settings: async () => {
    return api.getSettingsSync();
  },

  saveSettings: async (s) => {
    const current = api.getSettingsSync();
    const updated = { ...current, ...s, setup_complete: true };
    saveLocalSettings(updated);
    return updated;
  },

  serverSettings: async () => {
    try {
      return await req("/api/settings");
    } catch {
      return { server_has_gemini_key: true };
    }
  },

  models: (options = {}) => {
    const local = api.getSettingsSync();
    // In free tier mode, omit cloud_api_key so backend uses server key
    const isFreeTier =
      options.key_mode === "free" ||
      (!options.cloud_api_key && (options.key_mode !== "custom" && local?.key_mode === "free"));

    const apiKey = isFreeTier
      ? ""
      : options.cloud_api_key !== undefined
      ? options.cloud_api_key
      : local?.cloud_api_key || "";

    const payload = {
      provider: options.provider || local?.provider || "gemini",
      cloud_api_key: apiKey,
      ollama_url: options.ollama_url || local?.ollama_url || "http://localhost:11434",
    };
    return req("/api/models", json("POST", payload));
  },

  // === ACADEMIC PROFILES & TUTORING ===
  academic: {
    getRecords: () => localDB.getAcademicRecords(),
    saveRecord: (r) => localDB.saveAcademicRecord(r),
    deleteRecord: (id) => localDB.deleteAcademicRecord(id),
    getContext: (filterSubject = null) => localDB.buildAcademicContext(filterSubject),
  },

  tutor: {
    getMessages: () => localDB.getTutorMessages(),
    send: async (content, file, clientOcrText = "", subjectFilter = null) => {
      return await api.send("tutor_session", content, "tutor", file, clientOcrText, subjectFilter);
    },
    clear: () => localDB.clearTutorMessages(),
  },
};

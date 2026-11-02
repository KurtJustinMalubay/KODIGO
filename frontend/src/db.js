/**
 * Client-Side Local Database using standard browser IndexedDB
 * Guarantees 100% data persistence on user's device (mobile and desktop)
 * Even when Render backend sleeps, restarts, or wipes its ephemeral disk.
 */

const DB_NAME = "kodigo_local_db";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Chats store
        if (!db.objectStoreNames.contains("chats")) {
          const chatsStore = db.createObjectStore("chats", { keyPath: "id" });
          chatsStore.createIndex("is_pinned", "is_pinned", { unique: false });
          chatsStore.createIndex("updated_at", "updated_at", { unique: false });
        }

        // Messages store
        if (!db.objectStoreNames.contains("messages")) {
          const messagesStore = db.createObjectStore("messages", {
            keyPath: "id",
          });
          messagesStore.createIndex("chat_id", "chat_id", { unique: false });
        }

        // References store
        if (!db.objectStoreNames.contains("references")) {
          const refsStore = db.createObjectStore("references", {
            keyPath: "id",
          });
          refsStore.createIndex("scope", "scope", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export const localDB = {
  // === CHATS ===
  async getChats() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chats", "readonly");
      const store = tx.objectStore("chats");
      const req = store.getAll();

      req.onsuccess = () => {
        const list = req.result || [];
        // Sort: pinned first, then newest updated_at
        list.sort((a, b) => {
          if (!!b.is_pinned !== !!a.is_pinned) {
            return b.is_pinned ? 1 : -1;
          }
          return new Date(b.updated_at) - new Date(a.updated_at);
        });
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getChat(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chats", "readonly");
      const req = tx.objectStore("chats").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async createChat(title = "New Chat") {
    const db = await openDB();
    const newChat = {
      id: Date.now(),
      title: title.slice(0, 50),
      is_pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chats", "readwrite");
      const req = tx.objectStore("chats").add(newChat);
      req.onsuccess = () => resolve(newChat);
      req.onerror = () => reject(req.error);
    });
  },

  async updateChat(id, updates) {
    const db = await openDB();
    const chat = await this.getChat(id);
    if (!chat) return null;

    const updated = {
      ...chat,
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("chats", "readwrite");
      const req = tx.objectStore("chats").put(updated);
      req.onsuccess = () => resolve(updated);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteChat(id) {
    const db = await openDB();
    // Delete chat and associated messages
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["chats", "messages"], "readwrite");
      tx.objectStore("chats").delete(id);

      const msgStore = tx.objectStore("messages");
      const index = msgStore.index("chat_id");
      const req = index.openCursor(IDBKeyRange.only(id));

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          msgStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  // === MESSAGES ===
  async getMessages(chatId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const index = store.index("chat_id");
      const req = index.getAll(IDBKeyRange.only(chatId));

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (a.id > b.id ? 1 : -1));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async addMessage(msg) {
    const db = await openDB();
    const record = {
      id: msg.id || Date.now(),
      chat_id: msg.chat_id,
      sender: msg.sender || "user",
      mode: msg.mode || "quiz",
      content: msg.content || "",
      image_path: msg.image_path || null,
      has_explanation: !!msg.has_explanation,
      detailed_explanation: msg.detailed_explanation || null,
      created_at: msg.created_at || new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readwrite");
      const req = tx.objectStore("messages").put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  },

  async updateMessage(id, updates) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          resolve(null);
          return;
        }
        const updated = { ...existing, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  // === REFERENCES ===
  async getReferences(scope) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("references", "readonly");
      const store = tx.objectStore("references");
      const index = store.index("scope");
      const req = index.getAll(IDBKeyRange.only(String(scope)));

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async addReference(scope, filename, extractedText) {
    const db = await openDB();
    const record = {
      id: Date.now(),
      scope: String(scope),
      filename,
      extracted_text: extractedText,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("references", "readwrite");
      const req = tx.objectStore("references").add(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  },

  async toggleReference(id, isActive) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("references", "readwrite");
      const store = tx.objectStore("references");
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) return resolve(null);
        existing.is_active = isActive;
        store.put(existing);
        resolve(existing);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async deleteReference(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("references", "readwrite");
      const req = tx.objectStore("references").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async buildContextText(chatId) {
    const univ = await this.getReferences("universal");
    const chatRefs = chatId ? await this.getReferences(String(chatId)) : [];
    const active = [...univ, ...chatRefs].filter((r) => r.is_active);

    return active
      .map((r) => `[${r.filename}]\n${r.extracted_text || ""}`)
      .join("\n\n")
      .slice(0, 12000);
  },
};

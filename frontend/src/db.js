/**
 * Client-Side Local Database using standard browser IndexedDB
 * Guarantees 100% data persistence on user's device (mobile and desktop)
 * Even when Render backend sleeps, restarts, or wipes its ephemeral disk.
 */

const DB_NAME = "kodigo_local_db";
const DB_VERSION = 2;

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

        // Academic Records store for Tutor
        if (!db.objectStoreNames.contains("academic_records")) {
          db.createObjectStore("academic_records", { keyPath: "id" });
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
      const store = tx.objectStore("chats");
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
          return;
        }
        // Fallback for number/string ID type difference
        const altId =
          typeof id === "string" && !isNaN(id) ? Number(id) : String(id);
        if (altId !== id) {
          const altReq = store.get(altId);
          altReq.onsuccess = () => resolve(altReq.result || null);
          altReq.onerror = () => resolve(null);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },

  async createChat(title = "New Chat", isTutor = false) {
    const db = await openDB();
    const newChat = {
      id: Date.now(),
      title: title.slice(0, 50),
      is_pinned: false,
      is_tutor: !!isTutor,
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
    const altId =
      typeof id === "string" && !isNaN(id) ? Number(id) : String(id);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(["chats", "messages"], "readwrite");
      tx.objectStore("chats").delete(id);
      if (altId !== id) {
        tx.objectStore("chats").delete(altId);
      }

      const msgStore = tx.objectStore("messages");
      const index = msgStore.index("chat_id");

      const deleteForId = (targetKey) => {
        const req = index.openCursor(IDBKeyRange.only(targetKey));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            msgStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      };

      deleteForId(id);
      if (altId !== id) deleteForId(altId);

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
      const altId =
        typeof chatId === "string" && !isNaN(chatId)
          ? Number(chatId)
          : String(chatId);

      const req = index.getAll(IDBKeyRange.only(chatId));

      req.onsuccess = () => {
        let list = req.result || [];
        if (list.length === 0 && altId !== chatId) {
          const altReq = index.getAll(IDBKeyRange.only(altId));
          altReq.onsuccess = () => {
            const altList = altReq.result || [];
            altList.sort((a, b) => (a.id > b.id ? 1 : -1));
            resolve(altList);
          };
          altReq.onerror = () => resolve([]);
          return;
        }
        list.sort((a, b) => (a.id > b.id ? 1 : -1));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async addMessage(msg) {
    const db = await openDB();
    const uniqueId =
      msg.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id: uniqueId,
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

  // === ACADEMIC RECORDS & TUTOR COACH ===
  async getAcademicRecords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains("academic_records")) {
        resolve([]);
        return;
      }
      const tx = db.transaction("academic_records", "readonly");
      const store = tx.objectStore("academic_records");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async saveAcademicRecord(record) {
    const db = await openDB();
    const data = {
      id:
        record.id ||
        `record_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subject: record.subject?.trim() || "Untitled Subject",
      target_grade: record.target_grade || "",
      current_standing: record.current_standing || "",
      assessments: Array.isArray(record.assessments) ? record.assessments : [],
      notes: record.notes || "",
      updated_at: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction("academic_records", "readwrite");
      const req = tx.objectStore("academic_records").put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteAcademicRecord(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("academic_records", "readwrite");
      const req = tx.objectStore("academic_records").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async buildAcademicContext() {
    const records = await this.getAcademicRecords();
    if (!records || records.length === 0) return "";

    let context = "=== STUDENT ACADEMIC PROFILE & GRADE HISTORY ===\n";
    const weakAreas = [];

    records.forEach((rec, idx) => {
      context += `\nSubject ${idx + 1}: ${rec.subject}\n`;
      if (rec.current_standing)
        context += `  Current Standing / Grade: ${rec.current_standing}\n`;
      if (rec.target_grade)
        context += `  Target Grade: ${rec.target_grade}\n`;
      if (rec.notes)
        context += `  Student Notes / Struggle Areas: ${rec.notes}\n`;

      if (rec.assessments && rec.assessments.length > 0) {
        context += "  Assessment Scores:\n";
        rec.assessments.forEach((ass) => {
          const score = Number(ass.score) || 0;
          const total = Number(ass.total) || 0;
          const pct = total > 0 ? Math.round((score / total) * 100) : 0;
          context += `    - ${ass.title || "Assessment"}: ${score}/${total} (${pct}%)${
            ass.date ? ` on ${ass.date}` : ""
          }\n`;

          if (pct < 75 || (total > 0 && score / total < 0.75)) {
            weakAreas.push(
              `${rec.subject} -> ${ass.title} (${score}/${total}, ${pct}%)`
            );
          }
        });
      }
    });

    if (weakAreas.length > 0) {
      context += "\n=== PRIORITY WEAK POINTS (HIGH PRIORITY IMPROVEMENT NEEDED) ===\n";
      context +=
        "The student specifically scored low or struggled on the following assessments/topics. Prioritize conceptual reinforcement, Socratic questioning, and step-by-step problem solving on these topics:\n";
      weakAreas.forEach((w) => {
        context += `- ${w}\n`;
      });
    }

    return context;
  },

  // === TUTOR SESSION CHAT ISOLATION ===
  async getTutorMessages() {
    return await this.getMessages("tutor_session");
  },

  async addTutorMessage(msg) {
    return await this.addMessage({ ...msg, chat_id: "tutor_session" });
  },

  async clearTutorMessages() {
    return await this.deleteChat("tutor_session");
  },
};

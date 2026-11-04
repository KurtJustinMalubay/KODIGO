/**
 * Sync Manager — serialises IndexedDB data, uploads/downloads to Google Drive,
 * and handles merge/replace logic.
 *
 * Drive file layout (all inside the user's chosen folder):
 *   kodigo-chats.json    — chats + all their messages
 *   kodigo-refs.json     — all references (universal + per-chat)
 *   kodigo-academic.json — academic records
 *   kodigo-settings.json — app preferences (API credentials remain device-local)
 */

import { localDB } from "../db";
import { findFile, uploadJson, downloadJson } from "./driveApi";
import {
  DEFAULT_SETTINGS,
  getLocalSettings,
  getLocalSettingsUpdatedAt,
  saveLocalSettings,
} from "../api";

export const SYNC_FILENAMES = {
  chats: "kodigo-chats.json",
  refs: "kodigo-refs.json",
  academic: "kodigo-academic.json",
  settings: "kodigo-settings.json",
};

const isCredentialSetting = (key) => /(api.?key|token|secret|password)/i.test(key);

function getShareableSettings(settings) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !isCredentialSetting(key))
  );
}

// ─── Export: IndexedDB → plain JS objects ────────────────────────────────────

export async function exportLocalData() {
  // Get all chats
  const chats = await localDB.getChats();

  // Get messages for every chat
  const messagesMap = {};
  await Promise.all(
    chats.map(async (c) => {
      const msgs = await localDB.getMessages(c.id);
      if (msgs.length > 0) messagesMap[c.id] = msgs;
    })
  );

  // Get all references (universal + per-chat scopes)
  const universalRefs = await localDB.getReferences("universal");
  const chatRefsList = await Promise.all(
    chats.map((c) => localDB.getReferences(String(c.id)))
  );
  const allRefs = [
    ...universalRefs,
    ...chatRefsList.flat(),
  ];

  // Get academic records
  const academic = await localDB.getAcademicRecords();
  const settings = getLocalSettings() || { ...DEFAULT_SETTINGS };

  return {
    chats: { chats, messages: messagesMap, exportedAt: new Date().toISOString(), version: 2 },
    refs: { refs: allRefs, exportedAt: new Date().toISOString(), version: 2 },
    academic: { records: academic, exportedAt: new Date().toISOString(), version: 2 },
    settings: {
      settings: getShareableSettings(settings),
      updatedAt: getLocalSettingsUpdatedAt(),
      exportedAt: new Date().toISOString(),
      version: 1,
    },
  };
}

// ─── Import: plain JS objects → IndexedDB ────────────────────────────────────

/** Clear ALL local IndexedDB data */
export async function clearLocalData() {
  const db = await openRawDB();
  return new Promise((resolve, reject) => {
    const stores = ["chats", "messages", "references", "academic_records"];
    const tx = db.transaction(stores, "readwrite");
    stores.forEach((s) => tx.objectStore(s).clear());
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function openRawDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("kodigo_local_db");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Write chats + messages data into IndexedDB (merge by ID) */
async function importChatsData(data) {
  if (!data?.chats) return;
  const db = await openRawDB();

  // Put chats
  await new Promise((resolve, reject) => {
    const tx = db.transaction("chats", "readwrite");
    const store = tx.objectStore("chats");
    data.chats.forEach((c) => store.put(c));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  // Put messages
  if (data.messages) {
    const allMessages = Object.values(data.messages).flat();
    if (allMessages.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("messages", "readwrite");
        const store = tx.objectStore("messages");
        allMessages.forEach((m) => store.put(m));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  }
}

/** Write references into IndexedDB (merge by ID) */
async function importRefsData(data) {
  if (!data?.refs || data.refs.length === 0) return;
  const db = await openRawDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("references", "readwrite");
    const store = tx.objectStore("references");
    data.refs.forEach((r) => store.put(r));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Write academic records into IndexedDB (merge by ID) */
async function importAcademicData(data) {
  if (!data?.records || data.records.length === 0) return;
  const db = await openRawDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("academic_records", "readwrite");
    const store = tx.objectStore("academic_records");
    data.records.forEach((r) => store.put(r));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Import shareable settings while preserving credentials saved on this device. */
function importSettingsData(data, mode) {
  if (!data?.settings || typeof data.settings !== "object") return;

  const localSettings = getLocalSettings() || { ...DEFAULT_SETTINGS };
  const remoteUpdatedAt = data.updatedAt || data.exportedAt || "";
  const localUpdatedAt = getLocalSettingsUpdatedAt() || "";

  if (
    mode === "merge" &&
    new Date(localUpdatedAt || 0).getTime() >=
      new Date(remoteUpdatedAt || 0).getTime()
  ) {
    return;
  }

  const credentials = Object.fromEntries(
    Object.entries(localSettings).filter(([key]) => isCredentialSetting(key))
  );
  saveLocalSettings(
    {
      ...localSettings,
      ...getShareableSettings(data.settings),
      ...credentials,
    },
    remoteUpdatedAt || new Date().toISOString()
  );
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

/** Merge two arrays by ID, keeping the record with the newer updated_at */
function mergeById(local, remote) {
  const map = new Map();
  [...local, ...remote].forEach((item) => {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const itemTime = new Date(item.updated_at || item.created_at || 0).getTime();
      if (itemTime > existingTime) map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

// ─── High-level sync operations ───────────────────────────────────────────────

/**
 * Upload all local data to Drive.
 * @param {string} accessToken
 * @param {string} folderId
 * @param {function} onProgress - called with status string
 */
export async function pushToDrive(accessToken, folderId, onProgress = () => {}) {
  onProgress("Exporting local data…");
  const local = await exportLocalData();

  for (const [key, filename] of Object.entries(SYNC_FILENAMES)) {
    onProgress(`Uploading ${filename}…`);
    const existing = await findFile(accessToken, folderId, filename);
    await uploadJson(accessToken, folderId, filename, local[key], existing?.id);
  }

  onProgress("Done");
  return { success: true, syncedAt: new Date().toISOString() };
}

/**
 * Pull all data from Drive and merge into local IndexedDB.
 * mode: "merge" | "replace"
 */
export async function pullFromDrive(accessToken, folderId, mode = "merge", onProgress = () => {}) {
  onProgress("Downloading from Google Drive…");

  const remoteChatsFile = await findFile(accessToken, folderId, SYNC_FILENAMES.chats);
  const remoteRefsFile = await findFile(accessToken, folderId, SYNC_FILENAMES.refs);
  const remoteAcademicFile = await findFile(accessToken, folderId, SYNC_FILENAMES.academic);
  const remoteSettingsFile = await findFile(accessToken, folderId, SYNC_FILENAMES.settings);

  const [remoteChats, remoteRefs, remoteAcademic, remoteSettings] = await Promise.all([
    remoteChatsFile ? downloadJson(accessToken, remoteChatsFile.id) : null,
    remoteRefsFile ? downloadJson(accessToken, remoteRefsFile.id) : null,
    remoteAcademicFile ? downloadJson(accessToken, remoteAcademicFile.id) : null,
    remoteSettingsFile ? downloadJson(accessToken, remoteSettingsFile.id) : null,
  ]);

  if (mode === "replace") {
    onProgress("Clearing local data…");
    await clearLocalData();
  }

  if (mode === "merge" && remoteChats) {
    onProgress("Merging chats…");
    const localChats = await localDB.getChats();
    const localMessages = {};
    await Promise.all(localChats.map(async (c) => {
      localMessages[c.id] = await localDB.getMessages(c.id);
    }));

    const mergedChats = mergeById(localChats, remoteChats.chats || []);
    const mergedMessages = {};
    const allChatIds = new Set([...localChats.map(c => String(c.id)), ...(remoteChats.chats || []).map(c => String(c.id))]);
    allChatIds.forEach(id => {
      const local = localMessages[id] || localMessages[Number(id)] || [];
      const remote = remoteChats.messages?.[id] || remoteChats.messages?.[Number(id)] || [];
      mergedMessages[id] = mergeById(local, remote);
    });

    await importChatsData({ chats: mergedChats, messages: mergedMessages });
  } else if (remoteChats) {
    onProgress("Importing chats…");
    await importChatsData(remoteChats);
  }

  if (mode === "merge" && remoteRefs) {
    onProgress("Merging references…");
    const localRefs = [
      ...(await localDB.getReferences("universal")),
    ];
    const merged = mergeById(localRefs, remoteRefs.refs || []);
    await importRefsData({ refs: merged });
  } else if (remoteRefs) {
    await importRefsData(remoteRefs);
  }

  if (mode === "merge" && remoteAcademic) {
    onProgress("Merging academic records…");
    const localAcademic = await localDB.getAcademicRecords();
    const merged = mergeById(localAcademic, remoteAcademic.records || []);
    await importAcademicData({ records: merged });
  } else if (remoteAcademic) {
    await importAcademicData(remoteAcademic);
  }

  if (remoteSettings) {
    onProgress("Applying app settings…");
    importSettingsData(remoteSettings, mode);
  }

  onProgress("Done");
  return { success: true, syncedAt: new Date().toISOString() };
}

/**
 * Check if Drive folder has any existing KODIGO data files.
 * Returns { hasData, chatsModifiedAt } for conflict detection.
 */
export async function checkDriveHasData(accessToken, folderId) {
  const files = await Promise.all(
    Object.values(SYNC_FILENAMES).map((filename) =>
      findFile(accessToken, folderId, filename)
    )
  );
  const existingFiles = files.filter(Boolean);
  const modifiedTimes = existingFiles
    .map((file) => file.modifiedTime)
    .filter(Boolean)
    .sort();
  const modifiedAt = modifiedTimes[modifiedTimes.length - 1] || null;
  return {
    hasData: existingFiles.length > 0,
    modifiedAt,
  };
}

/**
 * Check if local IndexedDB has any data.
 */
export async function checkLocalHasData() {
  const chats = await localDB.getChats();
  const [academic, universalRefs, chatRefs] = await Promise.all([
    localDB.getAcademicRecords(),
    localDB.getReferences("universal"),
    Promise.all(chats.map((chat) => localDB.getReferences(String(chat.id)))),
  ]);
  const settings = getLocalSettings();
  const hasSettings = Boolean(settings?.setup_complete);
  const referenceCount = universalRefs.length + chatRefs.reduce(
    (count, refs) => count + refs.length,
    0
  );
  return {
    hasData: chats.length > 0 || academic.length > 0 || referenceCount > 0 || hasSettings,
    chatCount: chats.length,
    academicCount: academic.length,
  };
}

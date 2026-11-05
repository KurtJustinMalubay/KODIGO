import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import AcademicProfileModal from "./components/AcademicProfileModal";
import ChatFeed from "./components/ChatFeed";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import RefsModal from "./components/RefsModal";
import SettingsModal from "./components/SettingsModal";
import PrivacyTermsModal from "./components/PrivacyTermsModal";
import SetupWizard from "./components/SetupWizard";
import Sidebar from "./components/Sidebar";
import TutorWorkspace from "./components/TutorWorkspace";
import { compressImage, extractTextOnDevice } from "./utils/imageOptimizer";
import { useGoogleDriveSync } from "./hooks/useGoogleDriveSync";
import { FolderPickerModal, SyncConflictModal } from "./components/SyncModals";

const PRIVACY_ACCEPTANCE_KEY = "kodigo_privacy_terms_accepted_v1";

export default function App() {
  const [privacyAccepted, setPrivacyAccepted] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_ACCEPTANCE_KEY) === "accepted";
    } catch {
      return false;
    }
  });
  const [privacyError, setPrivacyError] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem("kodigo_view_mode");
      // Default to "tutor" on first open so AI Tutor is the main feature
      return saved === "chats" ? "chats" : "tutor";
    } catch {
      return "tutor";
    }
  });
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const [academicRecords, setAcademicRecords] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    try {
      const saved = localStorage.getItem("kodigo_active_chat_id");
      return saved ? Number(saved) || saved : null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState([]);
  const [settings, setSettings] = useState(() => api.getSettingsSync());
  const [mode, setMode] = useState(() => settings.default_mode || "tutor");
  const [sidebar, setSidebar] = useState(window.innerWidth >= 768);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState("");

  // In-memory cache for loaded chat messages to provide instant 0ms switching
  const messagesCacheRef = useRef(new Map());
  const activeChatIdRef = useRef(activeId);
  activeChatIdRef.current = activeId;

  // Instant zero-delay chat selection with cache-first strategy
  const select = useCallback((id) => {
    if (!id) return;
    try {
      localStorage.setItem("kodigo_active_chat_id", String(id));
    } catch {}
    // If already active and has loaded messages, do nothing
    if (id === activeChatIdRef.current && messagesCacheRef.current.has(id)) {
      return;
    }

    activeChatIdRef.current = id;
    setActiveId(id);
    setError("");

    // Instant cache hit: render cached messages immediately without waiting
    if (messagesCacheRef.current.has(id)) {
      setMessages(messagesCacheRef.current.get(id));
      setLoadingChat(false);
    } else {
      setMessages([]);
      setLoadingChat(true);
    }

    // Fetch fresh messages from local device IndexedDB (0ms)
    api
      .messages(id)
      .then((chatMessages) => {
        messagesCacheRef.current.set(id, chatMessages);
        if (activeChatIdRef.current === id) {
          setMessages(chatMessages);
          setLoadingChat(false);
        }
      })
      .catch((requestError) => {
        if (activeChatIdRef.current === id) {
          setError(requestError.message);
          setLoadingChat(false);
        }
      });
  }, []);

  // Fetch list of chats from local device IndexedDB
  const refreshChats = useCallback(
    async (preferredId = null) => {
      try {
        const data = await api.chats();
        setChats(data);

        // Auto-select chat matching active viewMode
        if (data.length > 0) {
          const currentMode = viewModeRef.current || "tutor";
          const isTutorMode = currentMode === "tutor";
          const savedId = localStorage.getItem("kodigo_active_chat_id");
          const targetId = preferredId || activeChatIdRef.current || savedId;
          const found = data.find((c) => String(c.id) === String(targetId));

          if (found && (isTutorMode ? Boolean(found.is_tutor) : !found.is_tutor)) {
            select(found.id);
          } else {
            const modeMatched = data.find((c) =>
              isTutorMode ? Boolean(c.is_tutor) : !c.is_tutor
            );
            if (modeMatched) {
              select(modeMatched.id);
            } else {
              activeChatIdRef.current = null;
              setActiveId(null);
              setMessages([]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load local chats from IndexedDB:", err);
      }
    },
    [select]
  );

  useEffect(() => {
    // 1. Immediately load local chats from device without waiting for server
    refreshChats();
  }, [refreshChats]);

  // Load local academic profile records on mount
  const loadAcademicRecords = useCallback(async () => {
    try {
      const data = await api.academic.getRecords();
      setAcademicRecords(data);
    } catch (err) {
      console.warn("Failed to load academic records:", err);
    }
  }, []);

  useEffect(() => {
    loadAcademicRecords();
  }, [loadAcademicRecords]);

  const saveAcademicRecord = useCallback(
    async (record) => {
      try {
        await api.academic.saveRecord(record);
        await loadAcademicRecords();
      } catch (err) {
        alert("Failed to save academic record: " + err.message);
      }
    },
    [loadAcademicRecords]
  );

  const deleteAcademicRecord = useCallback(
    async (id) => {
      try {
        await api.academic.deleteRecord(id);
        await loadAcademicRecords();
      } catch (err) {
        alert("Failed to delete academic record: " + err.message);
      }
    },
    [loadAcademicRecords]
  );

  // Weak spots count for badge in sidebar
  const weakSpotsCount = useMemo(() => {
    let count = 0;
    academicRecords.forEach((r) => {
      (r.assessments || []).forEach((a) => {
        const s = Number(a.score) || 0;
        const t = Number(a.total) || 0;
        if (t > 0 && s / t < 0.75) count++;
      });
    });
    return count;
  }, [academicRecords]);

  const newChat = useCallback(async () => {
    try {
      const chat = await api.newChat();
      activeChatIdRef.current = chat.id;
      setActiveId(chat.id);
      try {
        localStorage.setItem("kodigo_active_chat_id", String(chat.id));
      } catch {}
      setMessages([]);
      messagesCacheRef.current.set(chat.id, []);
      setError("");
      if (window.innerWidth < 768) setSidebar(false);
      await refreshChats(chat.id);
      return chat.id;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }, [refreshChats]);

  const newTutorChat = useCallback(async () => {
    try {
      const chat = await api.newTutorChat("New Tutor Session");
      if (chat) {
        activeChatIdRef.current = chat.id;
        setActiveId(chat.id);
        try {
          localStorage.setItem("kodigo_active_chat_id", String(chat.id));
        } catch {}
        setMessages([]);
        messagesCacheRef.current.set(chat.id, []);
        setError("");
        if (window.innerWidth < 768) setSidebar(false);
        await refreshChats(chat.id);
        return chat.id;
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [refreshChats]);

  const handleViewModeChange = useCallback(
    (newMode) => {
      setViewMode(newMode);
      try {
        localStorage.setItem("kodigo_view_mode", newMode);
      } catch {}
      if (newMode === "tutor") {
        const currentChat = chats.find(
          (c) => String(c.id) === String(activeChatIdRef.current)
        );
        if (!currentChat || !currentChat.is_tutor) {
          const tutorChat = chats.find((c) => c.is_tutor);
          if (tutorChat) {
            select(tutorChat.id);
          } else {
            activeChatIdRef.current = null;
            setActiveId(null);
            setMessages([]);
          }
        }
      } else {
        const currentChat = chats.find(
          (c) => String(c.id) === String(activeChatIdRef.current)
        );
        if (!currentChat || currentChat.is_tutor) {
          const normalChat = chats.find((c) => !c.is_tutor);
          if (normalChat) {
            select(normalChat.id);
          } else {
            activeChatIdRef.current = null;
            setActiveId(null);
            setMessages([]);
          }
        }
      }
    },
    [chats, select]
  );

  const deleteChat = useCallback(
    async (id) => {
      try {
        messagesCacheRef.current.delete(id);
        await api.delChat(id);
        if (id === activeChatIdRef.current) {
          activeChatIdRef.current = null;
          setActiveId(null);
          setMessages([]);
          try {
            localStorage.removeItem("kodigo_active_chat_id");
          } catch {}
        }
        await refreshChats();
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    [refreshChats]
  );

  // Chat pinning handler
  const pinChat = useCallback(
    async (id, pinned) => {
      try {
        await api.pinChat(id, pinned);
        setChats((prev) => {
          const updated = prev.map((c) =>
            c.id === id ? { ...c, is_pinned: pinned } : c
          );
          return [...updated].sort((a, b) => {
            if (!!b.is_pinned !== !!a.is_pinned) {
              return b.is_pinned ? 1 : -1;
            }
            return new Date(b.updated_at) - new Date(a.updated_at);
          });
        });
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    []
  );

  // Chat renaming handler
  const renameChat = useCallback(
    async (id, newTitle) => {
      try {
        await api.renameChat(id, newTitle);
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    []
  );

  // Chat export handler (.kod custom file format)
  const exportChat = useCallback(async (id) => {
    try {
      const data = await api.exportChat(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanTitle = (data.chat?.title || "chat")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      a.download = `kodigo-${cleanTitle}-${Date.now()}.kod`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (requestError) {
      alert("Failed to export chat: " + requestError.message);
    }
  }, []);

  // Chat import handler (.kod custom file format)
  const importChat = useCallback(
    async (file) => {
      try {
        const result = await api.importChat(file);
        await refreshChats();
        if (result?.chat?.id) {
          select(result.chat.id);
        }
      } catch (requestError) {
        alert("Failed to import chat: " + requestError.message);
      }
    },
    [refreshChats, select]
  );

  const send = useCallback(
    async (content, file) => {
      let chatId = activeChatIdRef.current;
      if (!chatId) {
        chatId = await newChat();
        if (!chatId) return;
      }
      setLoading(true);
      setError("");

      let clientOcrText = "";
      let processedFile = file;

      // Optimistic user message rendering so it shows instantly before thinking
      const tempUserMsgId = Date.now();
      const localImagePreview = file ? URL.createObjectURL(file) : null;
      const optimisticUserMsg = {
        id: tempUserMsgId,
        sender: "user",
        mode,
        content: content || (file ? "Analyzing image question..." : ""),
        image_path: localImagePreview,
        created_at: new Date().toISOString(),
      };

      const tempAiMsgId = tempUserMsgId + 1;
      const optimisticAiMsg = {
        id: tempAiMsgId,
        sender: "ai",
        mode,
        content: "",
        isStreaming: true,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticUserMsg, optimisticAiMsg]);

      // Step 1: On-Device Fast Image Compression (~20ms)
      if (file && file.type.startsWith("image/")) {
        try {
          processedFile = await compressImage(file, 1200, 0.8);
        } catch (compressionError) {
          console.warn("Image compression skipped:", compressionError);
        }

        // Only run slow client OCR if using a text-only local model like Ollama
        const currentProvider = settings?.provider || "gemini";
        if (currentProvider === "ollama") {
          try {
            clientOcrText = await extractTextOnDevice(processedFile);
          } catch (ocrError) {
            console.warn("Client OCR fallback:", ocrError);
          }
        }
      }

      const onChunk = (streamedText) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAiMsgId ? { ...m, content: streamedText } : m
          )
        );
      };

      try {
        const result = await api.send(
          chatId,
          content,
          mode,
          processedFile,
          clientOcrText,
          null,
          onChunk
        );

        // Replace optimistic messages with permanent saved messages
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) => m.id !== tempUserMsgId && m.id !== tempAiMsgId
          );
          const next = [...filtered, result.user, result.ai];
          messagesCacheRef.current.set(chatId, next);
          return next;
        });

        await refreshChats(chatId);
      } catch (requestError) {
        setError(requestError.message);
        // Remove optimistic messages on failure
        setMessages((prev) =>
          prev.filter((m) => m.id !== tempUserMsgId && m.id !== tempAiMsgId)
        );
      } finally {
        setLoading(false);
        if (localImagePreview) {
          URL.revokeObjectURL(localImagePreview);
        }
      }
    },
    [mode, newChat, refreshChats, settings?.provider]
  );

  const saveSettings = useCallback(async (value) => {
    try {
      const saved = await api.saveSettings(value);
      setSettings(saved);
      if (saved.default_mode) setMode(saved.default_mode);
      setModal(null);
    } catch (requestError) {
      alert(requestError.message);
    }
  }, []);

  const completeSetup = useCallback(
    async (value) => {
      try {
        const saved = await api.saveSettings({ ...value, setup_complete: true });
        setSettings(saved);
        if (saved.default_mode) setMode(saved.default_mode);
        await refreshChats();
      } catch (requestError) {
        alert(requestError.message);
      }
    },
    [refreshChats]
  );

  const openModal = useCallback(
    async (key) => {
      if (key === "chat" && !activeChatIdRef.current) await newChat();
      setModal(key);
    },
    [newChat]
  );

  const toggleSidebar = useCallback(() => {
    setSidebar((prev) => !prev);
  }, []);

  const acceptPrivacyTerms = useCallback(() => {
    try {
      localStorage.setItem(PRIVACY_ACCEPTANCE_KEY, "accepted");
      setPrivacyAccepted(true);
      setPrivacyError("");
    } catch {
      setPrivacyError("Could not save your choice. Please enable browser storage and try again.");
    }
  }, []);

  const refreshAfterSync = useCallback(async () => {
    await Promise.all([refreshChats(), loadAcademicRecords()]);
    const restoredSettings = api.getSettingsSync();
    setSettings(restoredSettings);
    if (restoredSettings.default_mode) setMode(restoredSettings.default_mode);
  }, [loadAcademicRecords, refreshChats]);

  // ── Google Drive Sync (optional) ─────────────────────────────────────────
  const {
    user: googleUser,
    lastSyncedAt,
    syncing,
    syncStatus,
    syncError,
    showFolderPicker,
    folders,
    handleFolderChosen,
    handleCreateFolder,
    showConflictModal,
    conflictInfo,
    resolveConflict,
    signIn: googleSignIn,
    signOut: googleSignOut,
    manualSync,
  } = useGoogleDriveSync({ onSyncComplete: refreshAfterSync });

  return (
    <div
      data-view-mode={viewMode}
      className="h-full w-full flex flex-col overflow-hidden bg-slate-950 text-slate-100"
    >
      <Header
        onToggle={toggleSidebar}
        onModal={openModal}
      />
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <Sidebar
          open={sidebar}
          chats={chats}
          activeId={activeId}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          weakSpotsCount={weakSpotsCount}
          onSelect={(id) => {
            const chat = chats.find((c) => String(c.id) === String(id));
            setViewMode(chat?.is_tutor ? "tutor" : "chats");
            select(id);
          }}
          onNew={viewMode === "tutor" ? newTutorChat : newChat}
          onDelete={deleteChat}
          onPin={pinChat}
          onRename={renameChat}
          onExport={exportChat}
          onImport={importChat}
          onClose={() => setSidebar(false)}
          googleUser={googleUser}
          lastSyncedAt={lastSyncedAt}
          syncing={syncing}
          syncStatus={syncStatus}
          syncError={syncError}
          onGoogleSignIn={googleSignIn}
          onGoogleSignOut={googleSignOut}
          onGoogleSync={manualSync}
        />
        {viewMode === "tutor" ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-slate-700/60">
            <TutorWorkspace
              activeId={activeId}
              activeChat={chats.find((c) => String(c.id) === String(activeId))}
              records={academicRecords}
              onRefreshChats={refreshChats}
              onNewTutorChat={newTutorChat}
              showTimestamps={Boolean(settings?.show_timestamps)}
            />
          </div>
        ) : (
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-slate-700/60 bg-slate-950/80 text-slate-100">
            <ChatFeed
              messages={messages}
              loading={loading}
              loadingChat={loadingChat}
              error={error}
              showTimestamps={Boolean(settings?.show_timestamps)}
            />
            <InputBar
              mode={mode}
              setMode={setMode}
              onSend={send}
              loading={loading}
            />
          </main>
        )}
      </div>

      {modal === "academic" && (
        <AcademicProfileModal
          records={academicRecords}
          onSaveRecord={saveAcademicRecord}
          onDeleteRecord={deleteAcademicRecord}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "univ" && (
        <RefsModal
          scope="universal"
          title="Universal References"
          onClose={() => setModal(null)}
        />
      )}
      {modal === "chat" && activeId && (
        <RefsModal
          scope={activeId}
          title="Chat References"
          onClose={() => setModal(null)}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setModal(null)}
        />
      )}
      {!privacyAccepted && (
        <PrivacyTermsModal
          onAccept={acceptPrivacyTerms}
          error={privacyError}
        />
      )}
      {privacyAccepted && !settings.setup_complete && (
        <SetupWizard savedSettings={settings} onComplete={completeSetup} />
      )}

      {/* Google Drive Sync Modals */}
      {showFolderPicker && (
        <FolderPickerModal
          folders={folders}
          onPick={handleFolderChosen}
          onCreateNew={handleCreateFolder}
          onClose={() => {}}
        />
      )}
      {showConflictModal && (
        <SyncConflictModal
          conflictInfo={conflictInfo}
          onResolve={resolveConflict}
        />
      )}
    </div>
  );
}

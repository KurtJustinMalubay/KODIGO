import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import ChatFeed from "./components/ChatFeed";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import RefsModal from "./components/RefsModal";
import SettingsModal from "./components/SettingsModal";
import SetupWizard from "./components/SetupWizard";
import Sidebar from "./components/Sidebar";

export default function App() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState("quiz");
  const [sidebar, setSidebar] = useState(window.innerWidth >= 768);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState("");

  // In-memory cache for loaded chat messages to provide instant 0ms switching
  const messagesCacheRef = useRef(new Map());
  const activeChatIdRef = useRef(activeId);
  activeChatIdRef.current = activeId;

  // Fetch list of chats
  const refreshChats = useCallback(async () => {
    try {
      const data = await api.chats();
      setChats(data);
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const currentSettings = await api.settings();
        setSettings(currentSettings);
        setMode(currentSettings.default_mode || "quiz");
        await refreshChats();
      } catch (requestError) {
        setError("Cannot reach backend: " + requestError.message);
      }
    })();
  }, [refreshChats]);

  // Instant zero-delay chat selection with cache-first strategy
  const select = useCallback((id) => {
    if (!id) return;
    if (window.innerWidth < 768) setSidebar(false);

    // If already active and has loaded messages, do nothing
    if (id === activeChatIdRef.current && messagesCacheRef.current.has(id)) {
      return;
    }

    activeChatIdRef.current = id;
    setActiveId(id);
    setError("");

    // Instant cache hit: render cached messages immediately without waiting for network
    if (messagesCacheRef.current.has(id)) {
      setMessages(messagesCacheRef.current.get(id));
      setLoadingChat(false);
    } else {
      // Clear previous messages immediately and show fast loader
      setMessages([]);
      setLoadingChat(true);
    }

    // Fetch fresh messages in background / on-demand
    api.messages(id)
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

  const newChat = useCallback(async () => {
    try {
      const chat = await api.newChat();
      activeChatIdRef.current = chat.id;
      setActiveId(chat.id);
      setMessages([]);
      messagesCacheRef.current.set(chat.id, []);
      setError("");
      if (window.innerWidth < 768) setSidebar(false);
      await refreshChats();
      return chat.id;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }, [refreshChats]);

  const deleteChat = useCallback(
    async (id) => {
      try {
        messagesCacheRef.current.delete(id);
        await api.delChat(id);
        if (id === activeChatIdRef.current) {
          activeChatIdRef.current = null;
          setActiveId(null);
          setMessages([]);
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
        // Optimistic UI update for instant response
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, is_pinned: pinned } : c))
        );
        await api.pinChat(id, pinned);
        await refreshChats();
      } catch (requestError) {
        setError(requestError.message);
        await refreshChats();
      }
    },
    [refreshChats]
  );

  // Chat renaming handler
  const renameChat = useCallback(
    async (id, newTitle) => {
      try {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
        await api.renameChat(id, newTitle);
        await refreshChats();
      } catch (err) {
        setError("Rename failed: " + err.message);
        await refreshChats();
      }
    },
    [refreshChats]
  );

  // Chat export handler (.kod file)
  const exportChat = useCallback(async (id, title) => {
    try {
      const data = await api.exportChat(id);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = (title || "chat")
        .replace(/[^\w\s-]/gi, "")
        .replace(/\s+/g, "_")
        .slice(0, 50);
      a.download = `${cleanName || "chat"}.kod`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Export failed: " + err.message);
    }
  }, []);

  // Chat import handler (.kod file)
  const importChat = useCallback(
    async (file) => {
      try {
        const result = await api.importChat(file);
        if (result?.chat) {
          await refreshChats();
          messagesCacheRef.current.set(result.chat.id, result.messages || []);
          select(result.chat.id);
        }
      } catch (err) {
        setError("Import failed: " + err.message);
      }
    },
    [refreshChats, select]
  );

  const send = useCallback(
    async (text, file) => {
      setError("");
      setLoading(true);
      try {
        const id = activeChatIdRef.current ?? (await newChat());
        if (!id) return;
        const result = await api.send(id, text, mode, file);
        setMessages((previous) => {
          const updated = [...previous, result.user, result.ai];
          messagesCacheRef.current.set(id, updated);
          return updated;
        });
        await refreshChats();
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [mode, newChat, refreshChats]
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
        const saved = await api.saveSettings(value);
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

  // Theme & font-size styling classes
  const themeClass = useMemo(() => {
    if (settings?.theme === "amoled") return "bg-black text-slate-100";
    if (settings?.theme === "midnight") return "bg-[#0b0f19] text-slate-100";
    return "bg-slate-950 text-slate-100";
  }, [settings?.theme]);

  const fontSizeClass = useMemo(() => {
    if (settings?.font_size === "small") return "text-xs";
    if (settings?.font_size === "large") return "text-base";
    if (settings?.font_size === "xlarge") return "text-lg";
    return "text-sm";
  }, [settings?.font_size]);

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-slate-300">
        {error || "Connecting to KODIGO…"}
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${themeClass} ${fontSizeClass}`}>
      <Header
        onToggle={toggleSidebar}
        settings={settings}
        onModal={openModal}
      />
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <Sidebar
          open={sidebar}
          chats={chats}
          activeId={activeId}
          onSelect={select}
          onNew={newChat}
          onDelete={deleteChat}
          onPin={pinChat}
          onRename={renameChat}
          onExport={exportChat}
          onImport={importChat}
          onClose={() => setSidebar(false)}
        />
        <main className="flex-1 flex flex-col min-w-0 bg-slate-950/80">
          <ChatFeed
            messages={messages}
            loading={loading}
            loadingChat={loadingChat}
            error={error}
          />
          <InputBar
            mode={mode}
            setMode={setMode}
            onSend={send}
            loading={loading}
          />
        </main>
      </div>

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
      {!settings.setup_complete && (
        <SetupWizard savedSettings={settings} onComplete={completeSetup} />
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  const [error, setError] = useState("");

  // Efficient batch / list retrieval of chats
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

  // Database optimization: Lazy loading - only retrieve messages for the chat being opened
  const select = useCallback(
    async (id) => {
      if (id === activeId) return; // Prevent unnecessary duplicate fetch
      setActiveId(id);
      setError("");
      try {
        const chatMessages = await api.messages(id);
        setMessages(chatMessages);
      } catch (requestError) {
        setError(requestError.message);
      }
      if (window.innerWidth < 768) setSidebar(false);
    },
    [activeId]
  );

  const newChat = useCallback(async () => {
    try {
      const chat = await api.newChat();
      await refreshChats();
      setActiveId(chat.id);
      setMessages([]);
      setError("");
      if (window.innerWidth < 768) setSidebar(false);
      return chat.id;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }, [refreshChats]);

  const deleteChat = useCallback(
    async (id) => {
      try {
        await api.delChat(id);
        if (id === activeId) {
          setActiveId(null);
          setMessages([]);
        }
        await refreshChats();
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    [activeId, refreshChats]
  );

  // Chat pinning handler
  const pinChat = useCallback(
    async (id, pinned) => {
      try {
        // Optimistic UI update
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

  const send = useCallback(
    async (text, file) => {
      setError("");
      setLoading(true);
      try {
        const id = activeId ?? (await newChat());
        if (!id) return;
        const result = await api.send(id, text, mode, file);
        setMessages((previous) => [...previous, result.user, result.ai]);
        await refreshChats();
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [activeId, mode, newChat, refreshChats]
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
      if (key === "chat" && !activeId) await newChat();
      setModal(key);
    },
    [activeId, newChat]
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
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar
          open={sidebar}
          chats={chats}
          activeId={activeId}
          onSelect={select}
          onNew={newChat}
          onDelete={deleteChat}
          onPin={pinChat}
        />
        <main className="flex-1 flex flex-col min-w-0 bg-slate-950/80">
          <ChatFeed messages={messages} loading={loading} error={error} />
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

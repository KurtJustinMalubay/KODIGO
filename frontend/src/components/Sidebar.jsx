import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  FileUp,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

function groupChats(chats) {
  const now = Date.now();
  const day = 864e5;
  const pinned = [];
  const today = [];
  const previous7Days = [];
  const older = [];

  chats.forEach((chat) => {
    if (chat.is_pinned) {
      pinned.push(chat);
      return;
    }
    const age = now - new Date(chat.updated_at + "Z").getTime();
    if (age < day) {
      today.push(chat);
    } else if (age < 7 * day) {
      previous7Days.push(chat);
    } else {
      older.push(chat);
    }
  });

  return {
    ...(pinned.length > 0 ? { Pinned: pinned } : {}),
    ...(today.length > 0 ? { Today: today } : {}),
    ...(previous7Days.length > 0 ? { "Previous 7 Days": previous7Days } : {}),
    ...(older.length > 0 ? { Older: older } : {}),
  };
}

export default function Sidebar({
  open,
  chats = [],
  activeId,
  onSelect,
  onNew,
  onDelete,
  onPin,
  onRename,
  onExport,
  onImport,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const fileInputRef = useRef(null);

  const filteredChats = useMemo(() => {
    if (!query.trim()) return chats;
    const lower = query.toLowerCase();
    return chats.filter((chat) => (chat.title || "").toLowerCase().includes(lower));
  }, [chats, query]);

  const groups = useMemo(() => groupChats(filteredChats), [filteredChats]);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (file && onImport) {
      onImport(file);
    }
    e.target.value = "";
  };

  return (
    <>
      {/* Mobile Backdrop Overlay: Tapping outside the sidebar closes it on mobile */}
      {open && (
        <div
          role="presentation"
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      <aside
        className={`fixed md:static z-30 h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col select-none ${
          open ? "w-72 max-w-[85vw]" : "w-0 md:w-16"
        }`}
      >
        {/* Hidden file input for .kod import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".kod,.json"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Top Action Bar */}
        <div className={`p-2.5 flex flex-col gap-2 ${open ? "" : "items-center"}`}>
          {!open && (
            <div className="hidden md:flex items-center justify-center py-1">
              <img src="/kodigo.png" alt="KODIGO" className="w-8 h-8 rounded-xl object-contain shadow-sm ring-1 ring-slate-800" />
            </div>
          )}
          <div className="flex items-center gap-1.5 w-full">
            {/* New Chat Button */}
            <button
              type="button"
              onClick={onNew}
              title="New Chat"
              className={`flex items-center gap-2.5 bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-sm shadow-indigo-500/20 cursor-pointer ${
                open
                  ? "flex-1 px-3.5 py-2.5 text-sm justify-start min-h-[42px]"
                  : "w-10 h-10 justify-center rounded-xl p-0"
              }`}
            >
              <Plus size={18} className="shrink-0" />
              {open && <span>New Chat</span>}
            </button>

            {/* Import Chat Button */}
            {open && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Import Chat (.kod)"
                className="flex items-center justify-center p-2.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 active:bg-slate-700 rounded-xl transition-colors min-h-[42px] px-3 text-xs gap-1.5 cursor-pointer border border-slate-700/40"
              >
                <FileUp size={16} className="text-indigo-400 shrink-0" />
                <span className="hidden sm:inline">Import</span>
              </button>
            )}
          </div>

          {/* Search input when open */}
          {open && (
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-xl px-2.5 py-1.5 focus-within:border-indigo-500/80 transition-colors">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="bg-transparent outline-none text-xs text-slate-100 w-full placeholder-slate-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Expanded View */}
        {open ? (
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
            {Object.keys(groups).length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                {query ? "No matching chats found." : "No chats yet. Start one!"}
              </div>
            ) : (
              Object.entries(groups).map(([groupName, list]) => (
                <div key={groupName} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {groupName === "Pinned" ? (
                      <>
                        <Pin size={11} className="text-indigo-400" />
                        <span className="text-indigo-300">Pinned</span>
                      </>
                    ) : (
                      <span>{groupName}</span>
                    )}
                    <span className="text-[10px] text-slate-500">({list.length})</span>
                  </div>

                  {list.map((chat) => (
                    <ExpandedChatRow
                      key={chat.id}
                      chat={chat}
                      active={chat.id === activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                      onTogglePin={onPin}
                      onRename={onRename}
                      onExport={onExport}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Minimized Dock Rail (PC only) */
          <div className="hidden md:flex flex-1 flex-col items-center py-2 overflow-y-auto gap-1.5 px-1">
            {/* Import quick button when minimized */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import Chat (.kod)"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors cursor-pointer mb-1"
            >
              <FileUp size={16} />
            </button>

            {chats.slice(0, 15).map((chat) => (
              <MinimizedChatButton
                key={chat.id}
                chat={chat}
                active={chat.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </aside>
    </>
  );
}

const ExpandedChatRow = memo(function ExpandedChatRow({
  chat,
  active,
  onSelect,
  onDelete,
  onTogglePin,
  onRename,
  onExport,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const inputRef = useRef(null);

  const handleClick = useCallback(() => {
    if (!isEditing) {
      onSelect(chat.id);
    }
  }, [chat.id, isEditing, onSelect]);

  const handleStartRename = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDraftTitle(chat.title);
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [chat.title]
  );

  const handleSaveRename = useCallback(
    (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      const trimmed = draftTitle.trim();
      if (trimmed && trimmed !== chat.title) {
        onRename(chat.id, trimmed);
      }
      setIsEditing(false);
    },
    [chat.id, chat.title, draftTitle, onRename]
  );

  const handleCancelRename = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsEditing(false);
  }, []);

  const handleDelete = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete(chat.id);
    },
    [chat.id, onDelete]
  );

  const handlePin = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTogglePin(chat.id, !chat.is_pinned);
    },
    [chat.id, chat.is_pinned, onTogglePin]
  );

  const handleExport = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onExport(chat.id, chat.title);
    },
    [chat.id, chat.title, onExport]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (!isEditing && (e.key === "Enter" || e.key === " ")) handleClick();
      }}
      className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-xs font-medium transition-all select-none min-h-[38px] ${
        active
          ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
          : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
      }`}
    >
      {chat.is_pinned ? (
        <Pin size={14} className="shrink-0 text-indigo-400" />
      ) : (
        <MessageSquare size={14} className="shrink-0 text-slate-400 group-hover:text-slate-300" />
      )}

      {isEditing ? (
        <div
          className="flex-1 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveRename(e);
              if (e.key === "Escape") handleCancelRename(e);
            }}
            className="flex-1 bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
          />
          <button
            type="button"
            onClick={handleSaveRename}
            title="Save title"
            className="p-1 text-emerald-400 hover:text-emerald-300"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={handleCancelRename}
            title="Cancel"
            className="p-1 text-slate-400 hover:text-slate-200"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <span
          onDoubleClick={handleStartRename}
          className="truncate flex-1 pointer-events-none"
        >
          {chat.title}
        </span>
      )}

      {/* Action Buttons: Visible on mobile if active, or on desktop hover */}
      {!isEditing && (
        <div
          className={`flex items-center gap-0.5 transition-opacity ${
            active
              ? "opacity-100"
              : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={handleStartRename}
            title="Rename chat"
            className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-slate-700 transition-colors"
          >
            <Pencil size={12} />
          </button>

          <button
            type="button"
            onClick={handleExport}
            title="Export chat (.kod)"
            className="p-1 rounded-md text-slate-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors"
          >
            <Download size={12} />
          </button>

          <button
            type="button"
            onClick={handlePin}
            title={chat.is_pinned ? "Unpin chat" : "Pin chat to top"}
            className={`p-1 rounded-md transition-colors ${
              chat.is_pinned
                ? "text-indigo-400 hover:bg-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            }`}
          >
            {chat.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            title="Delete chat"
            className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
});

const MinimizedChatButton = memo(function MinimizedChatButton({
  chat,
  active,
  onSelect,
}) {
  const handleClick = useCallback(() => {
    onSelect(chat.id);
  }, [chat.id, onSelect]);

  return (
    <div className="relative group flex items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer ${
          active
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        }`}
        aria-label={chat.title}
      >
        {chat.is_pinned ? (
          <Pin size={16} className={active ? "text-white" : "text-indigo-400"} />
        ) : (
          <MessageSquare size={16} />
        )}

        {/* Tiny indicator dot for active chat when not pinned */}
        {active && !chat.is_pinned && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white rounded-full" />
        )}
      </button>

      {/* Floating Tooltip */}
      <div className="pointer-events-none absolute left-14 z-50 ml-1 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 shadow-xl">
        {chat.is_pinned && <Pin size={11} className="text-indigo-400 shrink-0" />}
        <span className="font-medium max-w-[200px] truncate">{chat.title}</span>
      </div>
    </div>
  );
});

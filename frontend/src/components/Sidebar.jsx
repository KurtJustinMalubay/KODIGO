import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  FileUp,
  GraduationCap,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
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
  viewMode = "chats",
  onViewModeChange,
  weakSpotsCount = 0,
  onSelect,
  onNew,
  onDelete,
  onPin,
  onRename,
  onExport,
  onImport,
  onClose,
  onSettings,
}) {
  const [query, setQuery] = useState("");
  const fileInputRef = useRef(null);

  const normalCount = useMemo(() => chats.filter((c) => !c.is_tutor).length, [chats]);
  const tutorCount = useMemo(() => chats.filter((c) => !!c.is_tutor).length, [chats]);

  const filteredChats = useMemo(() => {
    const isTutorMode = viewMode === "tutor";
    const modeFiltered = chats.filter((c) =>
      isTutorMode ? !!c.is_tutor : !c.is_tutor
    );

    if (!query.trim()) return modeFiltered;
    const lower = query.toLowerCase();
    return modeFiltered.filter((chat) =>
      (chat.title || "").toLowerCase().includes(lower)
    );
  }, [chats, query, viewMode]);

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
        className={`fixed md:static z-30 h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col select-none overflow-hidden ${
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
          {/* Mobile Header: Visible only on small screens when sidebar is open */}
          {open && (
            <div className="flex items-center justify-between px-1 pb-1 md:hidden border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <img
                  src="/kodigo.png"
                  alt="KODIGO"
                  className="w-6 h-6 rounded-md object-contain"
                />
                <span className="font-bold tracking-wider text-xs text-slate-200">
                  KODIGO MENU
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close menu"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {!open && (
            <div className="hidden md:flex flex-col items-center gap-1.5 py-1">
              <img
                src="/kodigo.png"
                alt="KODIGO"
                className="w-8 h-8 rounded-xl object-contain shadow-sm ring-1 ring-slate-800 mb-1"
              />
              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange("tutor")}
                title="AI Tutor (Main Feature)"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer ${
                  viewMode === "tutor"
                    ? "bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/40 ring-1 ring-purple-400/50"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <GraduationCap size={18} />
                {weakSpotsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1.5 right-1.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange("chats")}
                title="Regular Chats"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === "chats"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <MessageSquare size={17} />
              </button>
            </div>
          )}

          {/* Mode Switcher when Sidebar is Open - AI Tutor is FIRST & Prominent */}
          {open && (
            <div className="grid grid-cols-2 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-medium mb-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange("tutor")}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all relative cursor-pointer ${
                  viewMode === "tutor"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-md shadow-purple-600/30 ring-1 ring-purple-400/40"
                    : "text-purple-300/80 hover:text-purple-200 hover:bg-purple-950/40"
                }`}
              >
                <GraduationCap size={15} />
                <span>AI Tutor ({tutorCount})</span>
                {weakSpotsCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onViewModeChange && onViewModeChange("chats")}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
                  viewMode === "chats"
                    ? "bg-slate-800 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <MessageSquare size={14} />
                <span>Chats ({normalCount})</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 w-full">
            {/* New Chat / New Tutor Session Button */}
            <button
              type="button"
              onClick={onNew}
              title={viewMode === "tutor" ? "Start New AI Tutor Session" : "New Normal Chat"}
              className={`flex items-center gap-2.5 text-white font-semibold rounded-xl transition-all shadow-sm cursor-pointer ${
                viewMode === "tutor"
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 shadow-purple-600/25 ring-1 ring-purple-400/30"
                  : "bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 shadow-indigo-500/20"
              } ${
                open
                  ? "flex-1 px-3.5 py-2.5 text-sm justify-start min-h-[42px]"
                  : "w-10 h-10 justify-center rounded-xl p-0"
              }`}
            >
              <Plus size={18} className="shrink-0" />
              {open && (
                <span>
                  {viewMode === "tutor" ? "New Tutor Session" : "New Chat"}
                </span>
              )}
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
                placeholder={
                  viewMode === "tutor"
                    ? "Search tutor sessions…"
                    : "Search normal chats…"
                }
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
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 space-y-4">
            {Object.keys(groups).length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                {query
                  ? "No matching conversations found."
                  : viewMode === "tutor"
                  ? "No tutor sessions yet. Start one!"
                  : "No chats yet. Start one!"}
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

            {filteredChats.slice(0, 15).map((chat) => (
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
          ? chat.is_tutor
            ? "bg-purple-950/60 text-white shadow-sm border border-purple-700/50"
            : "bg-slate-800 text-white shadow-sm border border-slate-700/60"
          : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
      }`}
    >
      {chat.is_pinned ? (
        <Pin size={14} className="shrink-0 text-indigo-400" />
      ) : chat.is_tutor ? (
        <GraduationCap size={15} className="shrink-0 text-purple-400" />
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
        <div
          onDoubleClick={handleStartRename}
          className="truncate flex-1 pointer-events-none flex items-center gap-1.5"
        >
          <span className="truncate">{chat.title}</span>
        </div>
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
            ? chat.is_tutor
              ? "bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/40 ring-1 ring-purple-400/50"
              : "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        }`}
        aria-label={chat.title}
      >
        {chat.is_pinned ? (
          <Pin size={16} className={active ? "text-white" : "text-indigo-400"} />
        ) : chat.is_tutor ? (
          <GraduationCap
            size={16}
            className={active ? "text-white" : "text-purple-400"}
          />
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
        {chat.is_tutor ? (
          <GraduationCap size={13} className="text-purple-400 shrink-0" />
        ) : chat.is_pinned ? (
          <Pin size={11} className="text-indigo-400 shrink-0" />
        ) : (
          <MessageSquare size={12} className="text-slate-400 shrink-0" />
        )}
        <span className="font-medium max-w-[200px] truncate">{chat.title}</span>
      </div>
    </div>
  );
});

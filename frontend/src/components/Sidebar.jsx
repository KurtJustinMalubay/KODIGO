import React, { useMemo, useState } from "react";
import { MessageSquare, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";

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
}) {
  const [query, setQuery] = useState("");

  const filteredChats = useMemo(() => {
    if (!query.trim()) return chats;
    const lower = query.toLowerCase();
    return chats.filter((chat) => (chat.title || "").toLowerCase().includes(lower));
  }, [chats, query]);

  const groups = useMemo(() => groupChats(filteredChats), [filteredChats]);

  return (
    <aside
      className={`fixed md:static z-30 h-full bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col select-none ${
        open ? "w-72" : "w-0 md:w-16"
      }`}
    >
      {/* Top Action Bar */}
      <div className={`p-2.5 flex flex-col gap-2 ${open ? "" : "items-center"}`}>
        <button
          onClick={onNew}
          title="New Chat"
          className={`flex items-center gap-2.5 bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-sm shadow-indigo-500/20 ${
            open
              ? "px-3.5 py-2.5 text-sm w-full justify-start"
              : "w-10 h-10 justify-center rounded-xl p-0"
          }`}
        >
          <Plus size={18} className="shrink-0" />
          {open && <span>New Chat</span>}
        </button>

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
                    onSelect={() => onSelect(chat.id)}
                    onDelete={(e) => {
                      e.stopPropagation();
                      onDelete(chat.id);
                    }}
                    onTogglePin={(e) => {
                      e.stopPropagation();
                      onPin(chat.id, !chat.is_pinned);
                    }}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Sleek Minimized View */
        <div className="hidden md:flex flex-1 flex-col items-center py-2 overflow-y-auto gap-1.5 px-1">
          {chats.slice(0, 15).map((chat) => {
            const isActive = chat.id === activeId;
            return (
              <div key={chat.id} className="relative group flex items-center justify-center">
                <button
                  onClick={() => onSelect(chat.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                  aria-label={chat.title}
                >
                  {chat.is_pinned ? (
                    <Pin size={16} className={isActive ? "text-white" : "text-indigo-400"} />
                  ) : (
                    <MessageSquare size={16} />
                  )}

                  {/* Tiny indicator dot for active chat when not pinned */}
                  {isActive && !chat.is_pinned && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </button>

                {/* Floating Tooltip with Pin Status and Title */}
                <div className="pointer-events-none absolute left-14 z-50 ml-1 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 shadow-xl">
                  {chat.is_pinned && <Pin size={11} className="text-indigo-400 shrink-0" />}
                  <span className="font-medium max-w-[200px] truncate">{chat.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function ExpandedChatRow({ chat, active, onSelect, onDelete, onTogglePin }) {
  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer text-xs font-medium transition-all ${
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

      <span className="truncate flex-1">{chat.title}</span>

      {/* Action Buttons (Pin & Delete) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePin}
          title={chat.is_pinned ? "Unpin chat" : "Pin chat to top"}
          className={`p-1 rounded-md transition-colors ${
            chat.is_pinned
              ? "text-indigo-400 hover:bg-slate-700"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          }`}
        >
          {chat.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>

        <button
          onClick={onDelete}
          title="Delete chat"
          className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

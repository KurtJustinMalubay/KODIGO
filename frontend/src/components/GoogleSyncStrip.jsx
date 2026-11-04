import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";

/**
 * GoogleSyncStrip — renders at the bottom of the sidebar.
 * Shows Google profile + sync button if signed in,
 * or a subtle "Sign in with Google" button if not.
 */
export default function GoogleSyncStrip({
  user,            // { name, email, picture } or null
  lastSyncedAt,    // ISO string or null
  syncing,
  syncStatus,
  syncError,
  onSignIn,
  onSignOut,
  onSync,
  sidebarOpen,     // whether sidebar is expanded or collapsed
}) {
  const [showMenu, setShowMenu] = useState(false);

  const relativeTime = (iso) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!user) {
    if (!sidebarOpen) {
      // Collapsed: just a cloud icon button
      return (
        <button
          type="button"
          onClick={onSignIn}
          title="Sign in with Google to sync data"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <CloudOff size={18} />
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onSignIn}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-700/60 hover:bg-slate-800/60 transition-colors cursor-pointer group"
      >
        {/* Google "G" icon (SVG) */}
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors truncate">
          Sign in with Google
        </span>
      </button>
    );
  }

  // ── Signed in — collapsed view ─────────────────────────────────────────────
  if (!sidebarOpen) {
    return (
      <div className="relative flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          title={syncing ? (syncStatus || "Syncing…") : `Sync now · Last: ${relativeTime(lastSyncedAt) || "never"}`}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-300 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60 relative"
        >
          {syncing ? (
            <Loader2 size={17} className="animate-spin text-blue-400" />
          ) : syncError ? (
            <AlertCircle size={17} className="text-red-400" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
        {user.picture && (
          <img
            src={user.picture}
            alt={user.name}
            title={user.name}
            className="w-7 h-7 rounded-full ring-1 ring-slate-600 object-cover"
          />
        )}
      </div>
    );
  }

  // ── Signed in — expanded view ──────────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      {/* Error banner */}
      {syncError && (
        <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-red-950/60 border border-red-800/40 text-[10px] text-red-300">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{syncError}</span>
        </div>
      )}

      {/* Sync progress */}
      {syncing && syncStatus && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-blue-300">
          <Loader2 size={11} className="animate-spin shrink-0" />
          <span className="truncate">{syncStatus}</span>
        </div>
      )}

      {/* Profile strip */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-800/50 transition-colors group relative">
        {/* Avatar */}
        <div className="shrink-0 relative">
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-7 h-7 rounded-full ring-1 ring-slate-600 object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {(user.name || user.email || "?")[0].toUpperCase()}
            </div>
          )}
          {/* Online dot */}
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-1 ring-slate-900" />
        </div>

        {/* Name + last synced — with right fade */}
        <div className="flex-1 min-w-0 relative">
          <div className="relative overflow-hidden">
            <p className="text-xs font-medium text-slate-200 truncate pr-6">{user.name || user.email}</p>
            {/* Fade gradient on right */}
            <div className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none" />
          </div>
          <p className="text-[10px] text-slate-500 leading-none mt-0.5">
            {lastSyncedAt ? `Synced ${relativeTime(lastSyncedAt)}` : "Not synced yet"}
          </p>
        </div>

        {/* Sync button */}
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          title={syncing ? (syncStatus || "Syncing…") : "Sync with Google Drive"}
          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-300 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          {syncing ? (
            <Loader2 size={14} className="animate-spin text-blue-400" />
          ) : lastSyncedAt ? (
            <CheckCircle2 size={14} className="text-green-400 group-hover:hidden" />
          ) : null}
          <RefreshCw size={14} className={lastSyncedAt && !syncing ? "hidden group-hover:block" : ""} />
        </button>

        {/* Sign out — appears on hover */}
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-700 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  );
}

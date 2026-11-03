import React from "react";
import { BookOpen, Globe, GraduationCap, Menu, Settings as Cog, Sparkles } from "lucide-react";

export default function Header({ onToggle, settings, onModal }) {
  const isFreeTier =
    settings?.provider === "gemini" &&
    (settings?.key_mode === "free" || (!settings?.key_mode && !settings?.cloud_api_key));

  const modelDisplay = settings?.model_name || "gemini-3.8-flash";

  return (
    <header className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md select-none shrink-0 z-10">
      {/* Sidebar toggle button (min 44px touch target on mobile) */}
      <button
        type="button"
        onClick={onToggle}
        title="Toggle sidebar"
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer shrink-0"
      >
        <Menu size={20} />
      </button>

      {/* Logo & Title */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="/kodigo.png"
          alt="KODIGO Logo"
          className="w-7 h-7 rounded-lg object-contain shadow-sm ring-1 ring-slate-800"
        />
        <h1 className="font-bold tracking-widest text-slate-100 text-sm sm:text-base">
          KODIGO
        </h1>
      </div>

      {/* Model & Tier Badge */}
      {settings && (
        <div className="flex items-center gap-1">
          <span
            title={`Active AI: ${modelDisplay} (${isFreeTier ? "Free Tier" : "Custom Key"})`}
            className={`text-[11px] font-medium rounded-full px-2 py-0.5 flex items-center gap-1 max-w-[110px] sm:max-w-[200px] truncate ${
              isFreeTier
                ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/50"
                : "bg-indigo-950/70 text-indigo-300 border border-indigo-800/50"
            }`}
          >
            {isFreeTier && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
            <span className="truncate">
              {isFreeTier ? "Free · " : ""}
              {modelDisplay.replace(/^gemini-/, "")}
            </span>
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0" />

      {/* Action Buttons: on mobile icon-only with minimum 40px touch area; on desktop shows label */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onModal("academic")}
          title="Academic Profile & Grades Hub"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <GraduationCap size={17} className="text-purple-400 shrink-0" />
          <span className="hidden lg:inline text-xs font-medium">Profile</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("univ")}
          title="Universal References & Notes"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <Globe size={16} className="text-cyan-400 shrink-0" />
          <span className="hidden lg:inline text-xs font-medium">Univ. Refs</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("chat")}
          title="Chat References"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <BookOpen size={16} className="text-indigo-400 shrink-0" />
          <span className="hidden lg:inline text-xs font-medium">Chat Refs</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("settings")}
          title="App Settings & AI Configuration"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <Cog size={17} className="text-slate-400 hover:text-slate-200 shrink-0" />
          <span className="hidden lg:inline text-xs font-medium">Settings</span>
        </button>
      </div>
    </header>
  );
}

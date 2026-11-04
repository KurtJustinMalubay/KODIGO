import React from "react";
import {
  AlertTriangle,
  BookOpen,
  Globe,
  GraduationCap,
  Menu,
  Settings as Cog,
} from "lucide-react";

export default function Header({
  onToggle,
  onModal,
  weakSpotsCount = 0,
}) {
  return (
    <header className="flex items-center justify-between gap-2 px-2 sm:px-3.5 h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md select-none shrink-0 z-10 w-full">
      {/* Keep navigation modes in the sidebar to avoid duplicate controls. */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <img
            src="/kodigo.png"
            alt="KODIGO Logo"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain shadow-sm ring-1 ring-violet-500/30"
          />
          <span className="font-extrabold tracking-widest text-slate-100 text-xs sm:text-sm leading-tight">
            KODIGO
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onModal("academic")}
          title="Academic Profile & Grades Hub"
          className={`flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            weakSpotsCount > 0
              ? "bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border border-amber-800/60 shadow-xs"
              : "text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 border border-transparent"
          }`}
        >
          {weakSpotsCount > 0 ? (
            <AlertTriangle size={15} className="text-amber-400 shrink-0" />
          ) : (
            <GraduationCap size={16} className="text-slate-400 shrink-0" />
          )}
          <span className="hidden sm:inline">Academic Profile</span>
          {weakSpotsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
              {weakSpotsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onModal("univ")}
          title="Universal References & Notes"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <Globe size={16} className="text-slate-400 shrink-0" />
          <span className="hidden lg:inline text-xs font-medium">Univ. Refs</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("chat")}
          title="Chat References"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <BookOpen size={16} className="text-slate-400 shrink-0" />
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

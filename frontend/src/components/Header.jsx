import React from "react";
import { BookOpen, Globe, GraduationCap, Menu, Settings as Cog } from "lucide-react";

export default function Header({ onToggle, settings, onModal }) {
  return (
    <header className="flex items-center justify-between px-2 sm:px-3 h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md select-none shrink-0 z-10 w-full">
      {/* Left side: Sidebar Toggle & App Title */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggle}
          title="Toggle sidebar"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <img
            src="/kodigo.png"
            alt="KODIGO Logo"
            className="w-7 h-7 rounded-lg object-contain shadow-sm ring-1 ring-slate-800"
          />
          <h1 className="font-bold tracking-widest text-slate-100 text-sm sm:text-base">
            KODIGO
          </h1>
        </div>
      </div>

      {/* Right side: Action Buttons (All visible on all screens!) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onModal("academic")}
          title="Academic Profile & Grades Hub"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <GraduationCap size={18} className="text-purple-400 shrink-0" />
          <span className="hidden md:inline text-xs font-medium">Profile</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("univ")}
          title="Universal References & Notes"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <Globe size={17} className="text-cyan-400 shrink-0" />
          <span className="hidden md:inline text-xs font-medium">Univ. Refs</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("chat")}
          title="Chat References"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <BookOpen size={17} className="text-indigo-400 shrink-0" />
          <span className="hidden md:inline text-xs font-medium">Chat Refs</span>
        </button>

        <button
          type="button"
          onClick={() => onModal("settings")}
          title="App Settings & AI Configuration"
          className="w-9 h-9 sm:w-auto sm:h-9 flex items-center justify-center gap-1.5 px-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800 transition-colors cursor-pointer"
        >
          <Cog size={18} className="text-slate-400 hover:text-slate-200 shrink-0" />
          <span className="hidden md:inline text-xs font-medium">Settings</span>
        </button>
      </div>
    </header>
  );
}

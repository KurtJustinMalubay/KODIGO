import React from "react";
import { BookOpen, Globe, GraduationCap, Menu, Settings as Cog } from "lucide-react";

export default function Header({ onToggle, settings, onModal }) {
  const Button = ({ icon: Icon, label, modal }) => (
    <button onClick={() => onModal(modal)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer">
      <Icon size={16} /><span className="hidden lg:inline">{label}</span>
    </button>
  );
  return (
    <header className="flex items-center gap-2 px-3 h-14 border-b border-slate-800 bg-slate-950 select-none">
      <button onClick={onToggle} title="Toggle sidebar" className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"><Menu size={20} /></button>
      <div className="flex items-center gap-2 mr-2">
        <img src="/kodigo.png" alt="KODIGO Logo" className="w-7 h-7 rounded-lg object-contain shadow-sm" />
        <h1 className="font-bold tracking-widest text-slate-100 text-base">KODIGO</h1>
      </div>
      {settings && <span className="text-xs bg-emerald-900/50 text-emerald-300 rounded-full px-2 py-0.5">{settings.provider === "ollama" ? "local · " : ""}{settings.model_name}</span>}
      <div className="flex-1" />
      <Button icon={GraduationCap} label="Academic Profile" modal="academic" />
      <Button icon={Globe} label="Univ. Refs" modal="univ" />
      <Button icon={BookOpen} label="Chat Refs" modal="chat" />
      <Button icon={Cog} label="Settings" modal="settings" />
    </header>
  );
}

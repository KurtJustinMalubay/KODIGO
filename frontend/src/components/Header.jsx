import React from "react";
import { BookOpen, Globe, Menu, Settings as Cog } from "lucide-react";

export default function Header({ onToggle, settings, onModal }) {
  const Button = ({ icon: Icon, label, modal }) => (
    <button onClick={() => onModal(modal)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800">
      <Icon size={16} /><span className="hidden lg:inline">{label}</span>
    </button>
  );
  return (
    <header className="flex items-center gap-2 px-3 h-14 border-b border-slate-800 bg-slate-950">
      <button onClick={onToggle} className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"><Menu size={20} /></button>
      <h1 className="font-bold tracking-widest text-slate-100">KODIGO</h1>
      {settings && <span className="text-xs bg-emerald-900/50 text-emerald-300 rounded-full px-2 py-0.5">{settings.provider === "ollama" ? "local · " : ""}{settings.model_name}</span>}
      <div className="flex-1" />
      <Button icon={Globe} label="Univ. Refs" modal="univ" />
      <Button icon={BookOpen} label="Chat Refs" modal="chat" />
      <Button icon={Cog} label="Settings" modal="settings" />
    </header>
  );
}

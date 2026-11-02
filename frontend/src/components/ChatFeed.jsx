import React, { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Sparkles } from "lucide-react";
import { api, resolveUrl } from "../api";
import Md from "./Md";

function AiMessage({ message }) {
  const [explanations, setExplanations] = useState(
    message.detailed_explanation ? { all: message.detailed_explanation } : {},
  );
  const [busy, setBusy] = useState(null);
  const items = message.mode === "quiz"
    ? [...new Set([...message.content.matchAll(/^\s*(\d+)[.)]/gm)].map((match) => match[1]))]
    : [];
  const explain = async (key) => {
    if (explanations[key] || busy) return;
    setBusy(key);
    try {
      const result = await api.explain(message.id, key === "all" ? null : Number(key));
      setExplanations((previous) => ({ ...previous, [key]: result.explanation }));
    } catch (error) {
      setExplanations((previous) => ({ ...previous, [key]: "⚠️ " + error.message }));
    }
    setBusy(null);
  };
  const color = message.mode === "quiz" ? "border-emerald-500" : "border-indigo-500";
  const pill = "flex items-center gap-1 text-xs rounded-full px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 cursor-pointer";
  return (
    <div className={`border-l-4 ${color} bg-slate-900 rounded-r-xl px-4 py-3 max-w-[90%] text-slate-100 shadow-sm`}>
      <Md>{message.content}</Md>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button className={pill} disabled={!!busy} onClick={() => explain("all")}>
            {busy === "all" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Explain All
          </button>
          {items.map((number) => (
            <button key={number} className={pill} disabled={!!busy} onClick={() => explain(number)}>
              {busy === number ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />} Explain Item #{number}
            </button>
          ))}
        </div>
      )}
      {Object.entries(explanations).map(([key, text]) => (
        <div key={key} className="mt-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700 animate-[fadeIn_.3s]">
          <div className="text-xs text-slate-400 mb-1">{key === "all" ? "Detailed explanation" : `Item #${key}`}</div>
          <Md>{text}</Md>
        </div>
      ))}
    </div>
  );
}

function UserMessage({ message }) {
  const isImage = message.image_path && /\.(png|jpe?g|webp|gif|bmp)$/i.test(message.image_path);
  return (
    <div className="self-end max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl px-4 py-2 text-sm shadow-sm">
      {isImage && <img src={resolveUrl(message.image_path)} alt="upload" className="rounded-lg mb-2 max-h-60" />}
      {message.image_path ? (
        <details><summary className="cursor-pointer text-slate-400 text-xs">Extracted text</summary><pre className="whitespace-pre-wrap">{message.content}</pre></details>
      ) : <div className="whitespace-pre-wrap">{message.content}</div>}
    </div>
  );
}

export default function ChatFeed({ messages, loading, loadingChat, loadingStatus, error }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, loadingStatus]);

  if (loadingChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium animate-pulse">
          <Loader2 size={18} className="animate-spin text-indigo-500" />
          <span>Opening conversation…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-24">
            <div className="text-3xl font-bold tracking-widest text-slate-200 mb-1">KODIGO</div>
            <p className="text-xs text-slate-400 mb-3">
              Created by <span className="font-semibold text-indigo-400">Kurt Justin J. Malubay</span> <span className="text-slate-500">(SASHIMI24)</span>
            </p>
            Drop a quiz image or ask a question to begin.
          </div>
        )}
        {messages.map((message) =>
          message.sender === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AiMessage key={message.id} message={message} />
          )
        )}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="font-medium text-slate-300">
              {loadingStatus || "Thinking…"}
            </span>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}

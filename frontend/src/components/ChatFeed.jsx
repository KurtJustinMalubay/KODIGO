import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import Md from "./Md";

function AiMessage({ message }) {
  const [explanations, setExplanations] = useState(
    message.detailed_explanation ? { all: message.detailed_explanation } : {}
  );
  const [minimized, setMinimized] = useState({});
  const [maximizedKey, setMaximizedKey] = useState(null);
  const [busy, setBusy] = useState(null);

  const items =
    message.mode === "quiz"
      ? [
          ...new Set(
            [...message.content.matchAll(/^\s*(\d+)[.)]/gm)].map(
              (match) => match[1]
            )
          ),
        ]
      : [];

  const explain = async (key) => {
    // If already generated, un-minimize if collapsed and return
    if (explanations[key]) {
      if (minimized[key]) {
        setMinimized((prev) => ({ ...prev, [key]: false }));
      }
      return;
    }
    if (busy) return;
    setBusy(key);
    try {
      const result = await api.explain(
        message.id,
        key === "all" ? null : Number(key),
        message
      );
      setExplanations((prev) => ({ ...prev, [key]: result.explanation }));
      setMinimized((prev) => ({ ...prev, [key]: false }));
    } catch (error) {
      setExplanations((prev) => ({ ...prev, [key]: "⚠️ " + error.message }));
    }
    setBusy(null);
  };

  const toggleMinimize = (key) => {
    setMinimized((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const color =
    message.mode === "quiz" ? "border-emerald-500" : "border-indigo-500";
  const pill =
    "flex items-center gap-1 text-xs rounded-full px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 cursor-pointer transition-colors";

  return (
    <>
      <div
        className={`border-l-4 ${color} bg-slate-900 rounded-r-xl px-4 py-3 max-w-[90%] text-slate-100 shadow-sm`}
      >
        <Md>{message.content}</Md>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              className={pill}
              disabled={!!busy}
              onClick={() => explain("all")}
            >
              {busy === "all" ? (
                <Loader2 size={12} className="animate-spin text-indigo-400" />
              ) : (
                <Sparkles size={12} className="text-indigo-400" />
              )}
              Explain All
            </button>
            {items.map((number) => (
              <button
                key={number}
                className={pill}
                disabled={!!busy}
                onClick={() => explain(number)}
              >
                {busy === number ? (
                  <Loader2 size={12} className="animate-spin text-emerald-400" />
                ) : (
                  <MessageSquare size={12} className="text-emerald-400" />
                )}
                Explain Item #{number}
              </button>
            ))}
          </div>
        )}

        {Object.entries(explanations).map(([key, text]) => {
          const isMin = !!minimized[key];
          const title =
            key === "all" ? "Detailed Explanation" : `Item #${key} Explanation`;

          return (
            <div
              key={key}
              className="mt-3 rounded-xl bg-slate-800/80 border border-slate-700/80 overflow-hidden shadow-sm transition-all"
            >
              {/* Header Bar with Title and Minimize / Maximize Controls */}
              <div
                className={`flex items-center justify-between px-3.5 py-2.5 ${
                  isMin ? "bg-slate-800/90 hover:bg-slate-700/70 cursor-pointer" : "bg-slate-800/50 border-b border-slate-700/60"
                } transition-colors select-none`}
                onClick={() => {
                  if (isMin) toggleMinimize(key);
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {key === "all" ? (
                    <Sparkles size={14} className="text-indigo-400 shrink-0" />
                  ) : (
                    <MessageSquare size={14} className="text-emerald-400 shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    {title}
                  </span>
                  {isMin && (
                    <span className="text-[11px] text-slate-400 font-normal italic">
                      (minimized · click to expand)
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1 shrink-0 ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => toggleMinimize(key)}
                    title={isMin ? "Maximize / Expand inline" : "Minimize explanation"}
                    className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded-md hover:bg-slate-700/80 transition-colors cursor-pointer"
                  >
                    {isMin ? (
                      <>
                        <ChevronDown size={14} />
                        <span className="hidden sm:inline">Expand</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp size={14} />
                        <span className="hidden sm:inline">Minimize</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMaximizedKey(key)}
                    title="Maximize to full view"
                    className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-100 px-2 py-1 rounded-md hover:bg-indigo-950/60 hover:text-white transition-colors cursor-pointer"
                  >
                    <Maximize2 size={13} />
                    <span className="hidden sm:inline">Maximize</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Content */}
              {!isMin && (
                <div className="p-3.5 text-slate-100 text-sm leading-relaxed overflow-x-auto">
                  <Md>{text}</Md>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Maximized Fullscreen Overlay / Modal View */}
      {maximizedKey && explanations[maximizedKey] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-[fadeIn_.2s]"
          onClick={() => setMaximizedKey(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 select-none">
              <div className="flex items-center gap-2.5">
                {maximizedKey === "all" ? (
                  <Sparkles size={16} className="text-indigo-400" />
                ) : (
                  <MessageSquare size={16} className="text-emerald-400" />
                )}
                <h3 className="text-sm font-semibold text-slate-100 tracking-wide">
                  {maximizedKey === "all"
                    ? "Detailed Quiz Explanation"
                    : `Item #${maximizedKey} Explanation`}
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMaximizedKey(null)}
                  title="Minimize / Exit full view"
                  className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <Minimize2 size={14} />
                  <span>Minimize</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMaximizedKey(null)}
                  title="Close"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-slate-100 text-sm leading-relaxed">
              <Md>{explanations[maximizedKey]}</Md>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UserMessage({ message }) {
  const isImage =
    message.image_path && /\.(png|jpe?g|webp|gif|bmp)$/i.test(message.image_path);
  return (
    <div className="self-end max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl px-4 py-2 text-sm shadow-sm">
      {isImage && (
        <img
          src={resolveUrl(message.image_path)}
          alt="upload"
          className="rounded-lg mb-2 max-h-60"
        />
      )}
      {message.image_path ? (
        <details>
          <summary className="cursor-pointer text-slate-400 text-xs">
            Extracted text
          </summary>
          <pre className="whitespace-pre-wrap">{message.content}</pre>
        </details>
      ) : (
        <div className="whitespace-pre-wrap">{message.content}</div>
      )}
    </div>
  );
}

export default function ChatFeed({
  messages,
  loading,
  loadingChat,
  loadingStatus,
  error,
}) {
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
          <div className="text-center text-slate-500 mt-20 flex flex-col items-center">
            <img
              src="/kodigo.png"
              alt="KODIGO Logo"
              className="w-20 h-20 rounded-2xl mb-4 shadow-xl shadow-indigo-500/10 object-contain ring-1 ring-slate-800"
            />
            <div className="text-3xl font-bold tracking-widest text-slate-200 mb-1">
              KODIGO
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Created by{" "}
              <span className="font-semibold text-indigo-400">
                Kurt Justin J. Malubay
              </span>{" "}
              <span className="text-slate-500">(SASHIMI24)</span>
            </p>
            <p className="text-sm text-slate-400">
              Drop a quiz image or ask a question to begin.
            </p>
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

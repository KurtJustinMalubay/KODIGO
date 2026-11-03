import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import Md from "./Md";
import { useTextToSpeech } from "../hooks/useSpeech";

function AiMessage({ message, showTimestamps }) {
  const [explanations, setExplanations] = useState(
    message.detailed_explanation ? { all: message.detailed_explanation } : {}
  );
  const [minimized, setMinimized] = useState({});
  const [maximizedKey, setMaximizedKey] = useState(null);
  const [busy, setBusy] = useState(null);
  const { speaking, speak, stop: stopTTS, supported: ttsSupported } = useTextToSpeech();

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
    "flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-slate-200 disabled:opacity-50 cursor-pointer transition-colors shadow-sm select-none";

  const timeFormatted = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <div
        className={`border-l-4 ${color} bg-slate-900/95 rounded-r-2xl sm:rounded-r-xl px-3.5 sm:px-4 py-3 sm:py-3.5 max-w-[96%] sm:max-w-[90%] text-slate-100 shadow-sm leading-relaxed`}
      >
        <Md>{message.content}</Md>

        {/* TTS + Timestamp row */}
        <div className="flex items-center justify-between mt-1.5">
          {ttsSupported && (
            <button
              type="button"
              onClick={() => speaking ? stopTTS() : speak(message.content)}
              title={speaking ? "Stop reading" : "Read aloud"}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                speaking
                  ? "text-indigo-300 bg-indigo-950/60 hover:bg-indigo-950"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
              <span className="hidden sm:inline">{speaking ? "Stop" : "Read"}</span>
            </button>
          )}
          {showTimestamps && timeFormatted && (
            <div className="text-[10px] text-slate-500 text-right opacity-70 ml-auto">
              {timeFormatted}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-2.5 border-t border-slate-800/80">
            <button
              type="button"
              className={pill}
              disabled={!!busy}
              onClick={() => explain("all")}
            >
              {busy === "all" ? (
                <Loader2 size={13} className="animate-spin text-indigo-400" />
              ) : (
                <Sparkles size={13} className="text-indigo-400" />
              )}
              <span>Explain All</span>
            </button>
            {items.map((number) => (
              <button
                key={number}
                type="button"
                className={pill}
                disabled={!!busy}
                onClick={() => explain(number)}
              >
                {busy === number ? (
                  <Loader2 size={13} className="animate-spin text-emerald-400" />
                ) : (
                  <MessageSquare size={13} className="text-emerald-400" />
                )}
                <span>Item #{number}</span>
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
              {/* Header Bar with Title and Controls */}
              <div
                className={`flex items-center justify-between px-3 py-2.5 ${
                  isMin
                    ? "bg-slate-800/90 hover:bg-slate-700/70 cursor-pointer"
                    : "bg-slate-800/50 border-b border-slate-700/60"
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
                    <span className="text-[10px] text-slate-400 font-normal italic hidden sm:inline">
                      (tap to expand)
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1 shrink-0 ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => toggleMinimize(key)}
                    title={isMin ? "Expand" : "Minimize"}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white p-1.5 sm:px-2 rounded-lg hover:bg-slate-700/80 transition-colors cursor-pointer"
                  >
                    {isMin ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    <span className="hidden sm:inline text-[11px]">
                      {isMin ? "Expand" : "Minimize"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMaximizedKey(key)}
                    title="Maximize to full view"
                    className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-100 p-1.5 sm:px-2 rounded-lg hover:bg-indigo-950/60 transition-colors cursor-pointer"
                  >
                    <Maximize2 size={14} />
                    <span className="hidden sm:inline text-[11px]">Full</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Content */}
              {!isMin && (
                <div className="p-3 sm:p-3.5 text-slate-100 text-sm leading-relaxed overflow-x-auto">
                  <Md>{text}</Md>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Maximized Fullscreen Overlay: Bottom sheet on mobile, centered modal on desktop */}
      {maximizedKey && explanations[maximizedKey] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-[fadeIn_.2s]"
          onClick={() => setMaximizedKey(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 text-slate-100 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl h-[88vh] sm:h-auto sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-800 bg-slate-950/70 select-none shrink-0">
              <div className="flex items-center gap-2">
                {maximizedKey === "all" ? (
                  <Sparkles size={16} className="text-indigo-400" />
                ) : (
                  <MessageSquare size={16} className="text-emerald-400" />
                )}
                <h3 className="text-sm font-semibold text-slate-100 truncate">
                  {maximizedKey === "all"
                    ? "Detailed Quiz Explanation"
                    : `Item #${maximizedKey} Explanation`}
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMaximizedKey(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-100 text-sm leading-relaxed">
              <Md>{explanations[maximizedKey]}</Md>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UserMessage({ message, showTimestamps }) {
  const isImage =
    message.image_path && /\.(png|jpe?g|webp|gif|bmp)$/i.test(message.image_path);
  const timeFormatted = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="self-end max-w-[92%] sm:max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl px-3.5 sm:px-4 py-2.5 text-sm shadow-sm leading-relaxed">
      {isImage && (
        <img
          src={resolveUrl(message.image_path)}
          alt="Question image"
          className="rounded-xl mb-2 max-h-56 w-full object-contain bg-slate-950/50"
        />
      )}
      {message.image_path ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-slate-400 text-xs select-none">
            Extracted text
          </summary>
          <pre className="whitespace-pre-wrap text-xs text-slate-300 mt-1 max-h-40 overflow-y-auto bg-slate-900/60 p-2 rounded-lg">
            {message.content}
          </pre>
        </details>
      ) : (
        <div className="whitespace-pre-wrap">{message.content}</div>
      )}
      {showTimestamps && timeFormatted && (
        <div className="text-[10px] text-slate-400 text-right mt-1 opacity-70">
          {timeFormatted}
        </div>
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
  showTimestamps = false,
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
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 sm:py-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-3.5 sm:gap-4 w-full">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-8 sm:mt-16 flex flex-col items-center px-4 select-none">
            <img
              src="/kodigo.png"
              alt="KODIGO Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mb-3 sm:mb-4 shadow-xl shadow-indigo-500/10 object-contain ring-1 ring-slate-800"
            />
            <div className="text-2xl sm:text-3xl font-bold tracking-widest text-slate-200 mb-1">
              KODIGO
            </div>
            <p className="text-xs text-slate-400 mb-2.5 sm:mb-3">
              Created by{" "}
              <span className="font-semibold text-indigo-400">
                Kurt Justin J. Malubay
              </span>{" "}
              <span className="text-slate-500">(SASHIMI24)</span>
            </p>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xs sm:max-w-md mx-auto leading-relaxed">
              Drop a quiz image or type your question below. AI answers step by step.
            </p>
          </div>
        )}
        {messages.map((message) =>
          message.sender === "user" ? (
            <UserMessage
              key={message.id}
              message={message}
              showTimestamps={showTimestamps}
            />
          ) : (
            <AiMessage
              key={message.id}
              message={message}
              showTimestamps={showTimestamps}
            />
          )
        )}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="font-medium text-slate-300">
              {loadingStatus || "Thinking…"}
            </span>
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-3.5 py-2.5">
            {error}
          </div>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}

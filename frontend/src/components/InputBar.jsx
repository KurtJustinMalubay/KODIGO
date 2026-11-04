import React, { useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  Send,
  X,
  Zap,
} from "lucide-react";
import { useSpeechToText } from "../hooks/useSpeech";

export default function InputBar({ mode, setMode, onSend, loading }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sttError, setSttError] = useState("");
  const fileRef = useRef(null);
  const textarea = useRef(null);

  const { listening, start: startSTT, stop: stopSTT } = useSpeechToText({
    onResult: (transcript) => {
      setText((prev) => (prev ? prev + " " + transcript : transcript));
      setSttError("");
    },
    onError: (msg) => {
      setSttError(msg);
      setTimeout(() => setSttError(""), 5000);
    },
  });

  const submit = () => {
    if (loading || (!text.trim() && !file)) return;
    onSend(text.trim(), file);
    setText("");
    setFile(null);
    if (textarea.current) {
      textarea.current.style.height = "auto";
    }
  };

  const isImage = file && file.type.startsWith("image/");

  return (
    <div className="border-t border-slate-800 bg-slate-950/95 backdrop-blur-md px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 select-none">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {/* Attached file preview chip */}
        {file && (
          <div className="flex items-center gap-2 text-xs text-slate-200 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 w-fit max-w-full shadow-sm animate-[fadeIn_.15s]">
            {isImage ? (
              <ImageIcon size={14} className="text-indigo-400 shrink-0" />
            ) : (
              <FileText size={14} className="text-cyan-400 shrink-0" />
            )}
            <span className="truncate max-w-[200px] sm:max-w-xs font-medium">
              {file.name}
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="p-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer ml-1"
              title="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* STT feedback / error banner */}
        {sttError && (
          <div className="text-xs text-amber-200 bg-amber-950/60 border border-amber-800/60 rounded-xl px-3 py-2 flex items-center justify-between gap-2 animate-[fadeIn_.2s]">
            <span>{sttError}</span>
            <button
              type="button"
              onClick={() => setSttError("")}
              className="text-amber-400 hover:text-amber-100 text-xs shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input box */}
        <div className="flex items-end gap-1.5 sm:gap-2 bg-slate-900/90 rounded-2xl px-2.5 sm:px-3 py-1.5 border border-slate-800 focus-within:border-indigo-500/80 transition-all shadow-sm">
          {/* File Picker button */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach image or PDF"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            hidden
            onChange={(event) => {
              if (event.target.files?.[0]) {
                setFile(event.target.files[0]);
              }
            }}
          />

          {/* Growing textarea */}
          <textarea
            ref={textarea}
            rows={1}
            value={text}
            placeholder={
              listening
                ? "🎙️ Listening... Speak into your device microphone"
                : mode === "quiz"
                ? "Drop quiz image, type question, or tap mic…"
                : "Ask anything, discuss, or speak your question…"
            }
            onChange={(event) => {
              setText(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = Math.min(event.target.scrollHeight, 140) + "px";
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            onPaste={(event) => {
              const image = [...event.clipboardData.files].find((item) =>
                item.type.startsWith("image/")
              );
              if (image) setFile(image);
            }}
            className="flex-1 bg-transparent outline-none resize-none text-sm text-slate-100 py-2.5 placeholder-slate-500 leading-relaxed max-h-36 min-h-[40px]"
          />

          {/* Built-in Speech-to-Text Mic button (Always visible on Desktop & Mobile) */}
          <button
            type="button"
            onClick={listening ? stopSTT : startSTT}
            title={listening ? "Stop voice recording" : "Speak using device built-in speech recognition"}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer shrink-0 ${
              listening
                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse ring-2 ring-red-400 shadow-md shadow-red-600/40"
                : "text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-800"
            }`}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={submit}
            disabled={loading || (!text.trim() && !file)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white shadow-md shadow-blue-600/25 transition-all cursor-pointer shrink-0 mb-0.5"
            title="Send message"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        {/* Mode Switcher toolbar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800/80 rounded-full p-0.5">
            <button
              type="button"
              onClick={() => setMode("quiz")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                mode === "quiz"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap size={13} className={mode === "quiz" ? "text-emerald-200" : "text-slate-500"} />
              <span>Quiz Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                mode === "chat"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare size={13} className={mode === "chat" ? "text-blue-200" : "text-slate-500"} />
              <span>Chat Mode</span>
            </button>
          </div>

          <span className="text-[10px] text-slate-500 hidden sm:inline">
            {mode === "quiz" ? "Direct answers list" : "Step-by-step tutoring"}
          </span>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  GraduationCap,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import { compressImage, extractTextOnDevice } from "../utils/imageOptimizer";
import Md from "./Md";
import { useSpeechToText, useTextToSpeech } from "../hooks/useSpeech";

const TutorMessageItem = React.memo(function TutorMessageItem({ message }) {
  const isUser = message.sender === "user";
  const { isSpeaking, toggle: toggleTTS } = useTextToSpeech(message.id);
  const isStreaming = Boolean(message.isStreaming);

  const isAutoPrompt =
    !message.content ||
    message.content === "Please solve this question or problem step-by-step." ||
    message.content === "Please solve this question." ||
    message.content === "Analyzing image question..." ||
    message.content === "Reviewing question image...";

  return (
    <div
      className={
        isUser
          ? "self-end max-w-[92%] sm:max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl px-3.5 sm:px-4 py-2.5 text-sm shadow-sm leading-relaxed"
          : "border-l-4 border-purple-500 bg-slate-900/95 rounded-r-2xl sm:rounded-r-xl px-3.5 sm:px-4 py-3 sm:py-3.5 max-w-[96%] sm:max-w-[90%] text-slate-100 shadow-sm leading-relaxed"
      }
    >
      {!isUser && (
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
            <GraduationCap size={14} className="text-purple-400" />
            <span>Academic Coach</span>
          </div>
          {/* Built-in Text-to-Speech button (Always visible on Desktop & Mobile) */}
          {!isStreaming && (
            <button
              type="button"
              onClick={() => toggleTTS(message.content)}
              title={isSpeaking ? "Stop speaking" : "Read aloud using device built-in speech"}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                isSpeaking
                  ? "text-purple-200 bg-purple-900/60 border border-purple-700/60 shadow-sm animate-pulse"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 active:bg-slate-800"
              }`}
            >
              {isSpeaking ? <VolumeX size={13} className="text-purple-400" /> : <Volume2 size={13} />}
              <span>{isSpeaking ? "Stop" : "Read"}</span>
            </button>
          )}
        </div>
      )}
      {message.image_path && (
        <img
          src={resolveUrl(message.image_path)}
          alt="Problem upload"
          className="rounded-lg mb-2 max-h-60"
        />
      )}
      {isUser ? (
        !isAutoPrompt && <div className="whitespace-pre-wrap">{message.content}</div>
      ) : isStreaming && !message.content ? (
        <div className="flex items-center gap-2 text-purple-300 text-xs py-1">
          <Loader2 size={13} className="animate-spin text-purple-400" />
          <span>Coach is thinking...</span>
        </div>
      ) : !message.content ? (
        <div className="text-slate-400 italic text-xs py-1">
          No response generated. Please try again.
        </div>
      ) : (
        <div className="relative">
          <Md>{message.content}</Md>
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-purple-400 animate-pulse rounded-sm align-middle" />
          )}
        </div>
      )}
    </div>
  );
});

export default function TutorWorkspace({
  activeId,
  activeChat,
  records = [],
  onOpenProfile,
  loadingSettings,
  onRefreshChats,
  onNewTutorChat,
}) {
  const isTutorSession = Boolean(activeChat && activeChat.is_tutor);
  const currentSessionId = isTutorSession ? activeId : null;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [sttError, setSttError] = useState("");

  const { listening, start: startSTT, stop: stopSTT } = useSpeechToText({
    onResult: (transcript) => {
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
      setSttError("");
    },
    onError: (msg) => {
      setSttError(msg);
      setTimeout(() => setSttError(""), 5000);
    },
  });
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const activeIdRef = useRef(currentSessionId);
  activeIdRef.current = currentSessionId;

  // Load messages for the selected tutor session
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    let active = true;
    api.messages(currentSessionId).then((msgs) => {
      if (active && activeIdRef.current === currentSessionId) setMessages(msgs);
    });
    return () => {
      active = false;
    };
  }, [currentSessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Identify weak points across academic records for context & display
  const weakSpots = [];
  records.forEach((r) => {
    (r.assessments || []).forEach((a) => {
      const s = Number(a.score) || 0;
      const t = Number(a.total) || 0;
      if (t > 0 && s / t < 0.75) {
        weakSpots.push({
          subject: r.subject,
          assessment: a.title,
          score: `${s}/${t}`,
          pct: Math.round((s / t) * 100),
        });
      }
    });
  });

  const handleSend = async (contentToSend = null) => {
    const text = (contentToSend !== null ? contentToSend : input).trim();
    if (!text && !file) return;

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      if (onNewTutorChat) {
        targetSessionId = await onNewTutorChat();
      }
      if (!targetSessionId) return;
    }

    const userFile = file;
    setInput("");
    setFile(null);
    setLoading(true);
    setLoadingStatus("Consulting academic profile…");

    // Optimistic user and AI messages for instantaneous feedback
    const tempId = Date.now();
    const localImg = userFile ? URL.createObjectURL(userFile) : null;
    const optUser = {
      id: tempId,
      chat_id: targetSessionId,
      sender: "user",
      mode: "tutor",
      content: text || (userFile ? "Reviewing question image..." : ""),
      image_path: localImg,
      created_at: new Date().toISOString(),
    };

    const optAi = {
      id: tempId + 1,
      chat_id: targetSessionId,
      sender: "ai",
      mode: "tutor",
      content: "",
      isStreaming: true,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optUser, optAi]);

    let processedFile = userFile;
    let clientOcrText = "";

    // On-device image compression (~20ms)
    if (userFile && userFile.type.startsWith("image/")) {
      try {
        processedFile = await compressImage(userFile, 1200, 0.8);
      } catch {}

      const localSettings = api.getSettingsSync();
      if (localSettings?.provider === "ollama") {
        try {
          setLoadingStatus("Scanning text locally…");
          clientOcrText = await extractTextOnDevice(processedFile, (s) =>
            setLoadingStatus(s)
          );
        } catch {}
      }
    }

    const onChunk = (streamed) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId + 1 ? { ...m, content: streamed } : m
        )
      );
    };

    try {
      setLoadingStatus("Coach is thinking…");
      const result = await api.send(
        targetSessionId,
        text,
        "tutor",
        processedFile,
        clientOcrText,
        subjectFilter,
        onChunk
      );
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId && m.id !== tempId + 1);
        return [...filtered, result.user, result.ai];
      });
      if (onRefreshChats) await onRefreshChats(targetSessionId);
    } catch (err) {
      alert("Tutor error: " + err.message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== tempId + 1));
    } finally {
      setLoading(false);
      setLoadingStatus("");
      if (localImg) URL.revokeObjectURL(localImg);
    }
  };

  const handleClear = async () => {
    if (!currentSessionId) return;
    if (
      confirm(
        "Delete this tutoring session? Your academic profile will be saved."
      )
    ) {
      await api.delChat(currentSessionId);
      if (onRefreshChats) await onRefreshChats();
    }
  };

  const starterPrompts = [
    ...(weakSpots.length > 0
      ? [
          `Quiz me step-by-step on ${weakSpots[0].subject} (${weakSpots[0].assessment}), where I scored ${weakSpots[0].pct}%.`,
          `Explain the foundational concepts I might have missed in ${weakSpots[0].subject}.`,
        ]
      : [
          "Can you assess my current understanding of my enrolled subjects and quiz me?",
        ]),
    "Give me a challenging practice problem with hints instead of the answer.",
    "Help me design an effective study schedule for my upcoming exams.",
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950/80 overflow-hidden">
      {/* Top Coach Header Bar */}
      <div className="px-3 sm:px-4 py-3 border-b border-purple-900/40 bg-gradient-to-r from-purple-950/60 via-slate-900/80 to-slate-900/70 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600/30 to-indigo-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 shadow-sm shadow-purple-500/10">
            <GraduationCap size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-white tracking-wide truncate">
                KODIGO Academic Coach
              </h2>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/40 shrink-0 tracking-widest uppercase">
                AI Tutor
              </span>
              <span className="hidden sm:inline text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                Socratic Method
              </span>
            </div>
            <p className="text-[11px] text-purple-300/70 truncate">
              Personalized tutoring tailored to your grades and weak spots.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition-all cursor-pointer ring-1 ring-purple-400/30"
          >
            <Award size={13} />
            <span className="hidden sm:inline">Academic Profile</span>
            <span className="sm:hidden">Profile</span>
            {weakSpots.length > 0 && (
              <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                {weakSpots.length}
              </span>
            )}
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Delete this tutoring session"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Weakness Alert Strip */}
      {weakSpots.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-900/30 flex items-center justify-between gap-2 overflow-x-auto select-none">
          <div className="flex items-center gap-2 text-xs text-amber-300 shrink-0">
            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
            <span className="font-semibold">Priority Focus:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
            {weakSpots.slice(0, 3).map((w, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-amber-900/40 text-amber-200 border border-amber-800/40 whitespace-nowrap"
              >
                {w.subject} · {w.assessment} ({w.pct}%)
              </span>
            ))}
            {weakSpots.length > 3 && (
              <span className="text-amber-400 text-[11px] whitespace-nowrap">
                +{weakSpots.length - 3} more
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenProfile}
            className="text-[11px] text-amber-400 hover:text-amber-200 underline shrink-0 cursor-pointer ml-1"
          >
            View
          </button>
        </div>
      )}

      {/* Subject Context Filter */}
      {records.length > 0 && (
        <div className="px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2 shrink-0">
          <BookOpen size={13} className="text-indigo-400 shrink-0" />
          <span className="text-[11px] text-slate-400 font-medium shrink-0">Context:</span>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="flex-1 max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Subjects</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>{r.subject}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tutor Chat Feed */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-4 w-full">
          {messages.length === 0 && (
            <div className="my-6 text-center space-y-5">
              {/* Hero icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-600/25 to-indigo-600/15 border border-purple-500/30 mx-auto flex items-center justify-center text-purple-300 shadow-xl shadow-purple-500/10">
                  <GraduationCap size={38} />
                </div>
                <span className="absolute -top-1.5 -right-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md tracking-wide">
                  MAIN
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-extrabold text-white tracking-tight">
                  Your Personal Academic Coach
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed px-4">
                  KODIGO AI Tutor uses the{" "}
                  <span className="text-purple-300 font-semibold">Socratic method</span> to guide
                  you through your weak spots, explain concepts from first principles, and help you
                  truly understand — not just memorize.
                </p>
              </div>

              {records.length === 0 ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/60 to-slate-900/80 border border-purple-700/40 max-w-sm mx-auto text-center space-y-3 w-full shadow-lg shadow-purple-900/20">
                  <div className="text-xs text-slate-300 leading-relaxed">
                    Set up your subjects and grades so KODIGO can personalize your tutoring sessions and focus on what matters most.
                  </div>
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-purple-600/30 transition-all cursor-pointer ring-1 ring-purple-400/30"
                  >
                    <Award size={15} /> Set Up Academic Profile
                  </button>
                  <p className="text-[10px] text-slate-500">
                    You can also start chatting right away without a profile.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-w-sm mx-auto text-left w-full px-1">
                  <div className="text-[10px] font-bold text-purple-400/80 uppercase tracking-widest text-center">
                    ✨ Suggested Coaching Sessions
                  </div>
                  <div className="flex flex-col gap-2">
                    {starterPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="text-left text-xs text-slate-300 hover:text-white p-3 rounded-xl bg-gradient-to-r from-slate-900/90 to-purple-950/30 hover:from-slate-800 hover:to-purple-900/40 border border-slate-800 hover:border-purple-500/60 transition-all flex items-start gap-2.5 shadow-sm cursor-pointer w-full"
                      >
                        <Sparkles
                          size={14}
                          className="text-purple-400 shrink-0 mt-0.5"
                        />
                        <span className="leading-snug">{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((m) => (
            <TutorMessageItem key={m.id} message={m} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 size={16} className="animate-spin text-purple-400" />
              <span className="font-medium text-slate-300">
                {loadingStatus || "Coach is preparing guidance…"}
              </span>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input Bar for Tutor */}
      <div className="px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-purple-900/30 bg-gradient-to-r from-purple-950/30 via-slate-950/95 to-slate-950/95 backdrop-blur-md shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="max-w-3xl mx-auto flex flex-col gap-2"
        >
          {file && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
              <span className="truncate">Attached: {file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-slate-500 hover:text-slate-300 ml-2"
              >
                Remove
              </button>
            </div>
          )}

          {sttError && (
            <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/40 rounded-lg px-3 py-1.5 animate-[fadeIn_.2s]">
              {sttError}
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-900/90 border border-purple-800/50 rounded-2xl px-3 py-2 focus-within:border-purple-500 focus-within:shadow-sm focus-within:shadow-purple-500/10 transition-all">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0]);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach quiz question or homework problem"
              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-950/50 transition-colors cursor-pointer shrink-0"
            >
              <Upload size={16} />
            </button>

            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={listening ? "Listening…" : "Ask your coach anything, request a practice problem, or paste a question..."}
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32"
            />

            {/* Built-in Speech-to-Text Mic button (Always visible on Desktop & Mobile) */}
            <button
              type="button"
              onClick={listening ? stopSTT : startSTT}
              title={listening ? "Stop voice recording" : "Speak using device built-in speech recognition"}
              className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                listening
                  ? "bg-red-600 hover:bg-red-500 text-white animate-pulse ring-2 ring-red-400 shadow-md shadow-red-600/40"
                  : "text-slate-400 hover:text-purple-300 hover:bg-purple-950/50 active:bg-slate-800"
              }`}
            >
              {listening ? <MicOff size={17} /> : <Mic size={17} />}
            </button>

            <button
              type="submit"
              disabled={(!input.trim() && !file) || loading}
              className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white transition-all cursor-pointer shrink-0 shadow-sm shadow-purple-600/30"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

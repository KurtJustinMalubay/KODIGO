import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  GraduationCap,
  Loader2,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import { compressImage, extractTextOnDevice } from "../utils/imageOptimizer";
import Md from "./Md";
import InputBar from "./InputBar";
import { useTextToSpeech } from "../hooks/useSpeech";

const TutorMessageItem = React.memo(function TutorMessageItem({
  message,
  showTimestamps,
}) {
  const isUser = message.sender === "user";
  const { isSpeaking, toggle: toggleTTS } = useTextToSpeech(message.id);
  const isStreaming = Boolean(message.isStreaming);
  const timeFormatted = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

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
          : "border-l-4 border-violet-500 bg-slate-900/95 rounded-r-2xl sm:rounded-r-xl px-3.5 sm:px-4 py-3 sm:py-3.5 max-w-[96%] sm:max-w-[90%] text-slate-100 shadow-sm leading-relaxed"
      }
    >
      {!isUser && (
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
            <GraduationCap size={14} className="text-violet-400" />
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
                  ? "text-violet-200 bg-violet-900/60 border border-violet-700/60 shadow-sm animate-pulse"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 active:bg-slate-800"
              }`}
            >
              {isSpeaking ? <VolumeX size={13} className="text-violet-400" /> : <Volume2 size={13} />}
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
        <div className="flex items-center gap-2 text-violet-300 text-xs py-1">
          <Loader2 size={13} className="animate-spin text-violet-400" />
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
            <span className="inline-block w-1.5 h-4 ml-1 bg-violet-400 animate-pulse rounded-sm align-middle" />
          )}
        </div>
      )}
      {showTimestamps && !isStreaming && timeFormatted && (
        <div className="text-[10px] text-slate-500 text-right mt-1 opacity-70">
          {timeFormatted}
        </div>
      )}
    </div>
  );
});

export default function TutorWorkspace({
  activeId,
  activeChat,
  records = [],
  onRefreshChats,
  onNewTutorChat,
  showTimestamps = false,
}) {
  const isTutorSession = Boolean(activeChat && activeChat.is_tutor);
  const currentSessionId = isTutorSession ? activeId : null;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [tutorMode, setTutorMode] = useState("quiz");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [error, setError] = useState("");
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

  const handleSend = async (
    contentToSend = "",
    userFile = null,
    selectedMode = tutorMode
  ) => {
    const text = (contentToSend || "").trim();
    if (!text && !userFile) return;

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      if (onNewTutorChat) {
        targetSessionId = await onNewTutorChat();
      }
      if (!targetSessionId) return;
    }

    setLoading(true);
    setError("");
    setLoadingStatus("Consulting academic profile…");
    const apiMode = selectedMode === "quiz" ? "tutor_quiz" : "tutor";

    // Optimistic user and AI messages for instantaneous feedback
    const tempId = Date.now();
    const localImg = userFile ? URL.createObjectURL(userFile) : null;
    const optUser = {
      id: tempId,
      chat_id: targetSessionId,
      sender: "user",
      mode: apiMode,
      content: text || (userFile ? "Reviewing question image..." : ""),
      image_path: localImg,
      created_at: new Date().toISOString(),
    };

    const optAi = {
      id: tempId + 1,
      chat_id: targetSessionId,
      sender: "ai",
      mode: apiMode,
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
        apiMode,
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
      setError(err.message || "Tutor could not respond. Please try again.");
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
          `Start a professor-led practice quiz on ${weakSpots[0].subject} (${weakSpots[0].assessment}), where I scored ${weakSpots[0].pct}%. Ask one question and wait for my answer.`,
          `Explain the foundational concepts I might have missed in ${weakSpots[0].subject}.`,
        ]
      : [
          "Start a professor-led practice quiz on one of my subjects. Ask one question at a time and wait for my answer.",
        ]),
    "Give me a challenging practice problem with hints instead of the answer.",
    "Help me design an effective study schedule for my upcoming exams.",
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950/80 overflow-hidden">
      {/* Top Coach Header Bar */}
      <div className="px-3 sm:px-4 py-3 border-b border-violet-900/40 bg-slate-900/80 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-violet-600/15 border border-violet-500/35 flex items-center justify-center text-violet-300 shrink-0">
            <GraduationCap size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-white tracking-wide truncate">
                KODIGO Academic Coach
              </h2>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-500/30 shrink-0 tracking-widest uppercase">
                AI Tutor
              </span>
              <span className="hidden sm:inline text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                Socratic Method
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {tutorMode === "quiz"
                ? "Professor-led practice, one question at a time."
                : "Coaching tailored to your grades and weak spots."}
            </p>
          </div>
        </div>

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
        </div>
      )}

      {/* Subject Context Filter */}
      {records.length > 0 && (
        <div className="px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2 shrink-0">
          <BookOpen size={13} className="text-violet-400 shrink-0" />
          <span className="text-[11px] text-slate-400 font-medium shrink-0">Context:</span>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full min-w-0 max-w-xs flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="all">All Subjects</option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>{r.subject}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tutor Chat Feed */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 sm:py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-3.5 sm:gap-4 w-full">
          {messages.length === 0 && (
            <div className="my-6 text-center space-y-5">
              {/* Hero icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="w-20 h-20 rounded-3xl bg-violet-600/15 border border-violet-500/30 mx-auto flex items-center justify-center text-violet-300">
                  <GraduationCap size={38} />
                </div>
                <span className="absolute -top-1.5 -right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-violet-600 text-white shadow-sm tracking-wide">
                  MAIN
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-extrabold text-white tracking-tight">
                  Your Personal Academic Coach
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed px-4">
                  KODIGO AI Tutor uses the{" "}
                  <span className="text-violet-300 font-semibold">Socratic method</span> to guide
                  you through your weak spots, explain concepts from first principles, and help you
                  truly understand — not just memorize.
                </p>
              </div>

              <div className="space-y-2.5 max-w-sm mx-auto text-left w-full px-1">
                <div className="text-[10px] font-bold text-violet-400/80 uppercase tracking-widest text-center">
                  ✨ Suggested Coaching Sessions
                </div>
                <div className="flex flex-col gap-2">
                  {starterPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSend(prompt)}
                      className="text-left text-xs text-slate-300 hover:text-white p-3 rounded-xl bg-slate-900/90 hover:bg-violet-950/40 border border-slate-800 hover:border-violet-500/60 transition-all flex items-start gap-2.5 shadow-sm cursor-pointer w-full"
                    >
                      <Sparkles
                        size={14}
                        className="text-violet-400 shrink-0 mt-0.5"
                      />
                      <span className="leading-snug">{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m) => (
            <TutorMessageItem
              key={m.id}
              message={m}
              showTimestamps={showTimestamps}
            />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 size={16} className="animate-spin text-violet-400" />
              <span className="font-medium text-slate-300">
                {loadingStatus || "Coach is preparing guidance…"}
              </span>
            </div>
          )}

          {error && (
            <div className="text-red-300 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <InputBar
        mode={tutorMode}
        setMode={setTutorMode}
        onSend={handleSend}
        loading={loading}
        variant="tutor"
      />
    </div>
  );
}

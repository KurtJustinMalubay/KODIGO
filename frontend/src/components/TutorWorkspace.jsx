import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  GraduationCap,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import { compressImage, extractTextOnDevice } from "../utils/imageOptimizer";
import Md from "./Md";

export default function TutorWorkspace({
  activeId,
  records = [],
  onOpenProfile,
  loadingSettings,
  onRefreshChats,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Load messages for the selected tutor session
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    api.messages(activeId).then((msgs) => {
      if (active && activeIdRef.current === activeId) setMessages(msgs);
    });
    return () => {
      active = false;
    };
  }, [activeId]);

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
    if (!activeId) return;

    const userFile = file;
    setInput("");
    setFile(null);
    setLoading(true);
    setLoadingStatus("Consulting academic profile…");

    // Optimistic user message
    const tempId = Date.now();
    const localImg = userFile ? URL.createObjectURL(userFile) : null;
    const optUser = {
      id: tempId,
      chat_id: activeId,
      sender: "user",
      mode: "tutor",
      content: text || (userFile ? "Reviewing question image..." : ""),
      image_path: localImg,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optUser]);

    let processedFile = userFile;
    let clientOcrText = "";

    // On-device image compression + OCR before sending
    if (userFile && userFile.type.startsWith("image/")) {
      try {
        setLoadingStatus("Optimizing image on device…");
        processedFile = await compressImage(userFile, 1400, 0.82);
      } catch {}
      try {
        setLoadingStatus("Scanning text locally…");
        clientOcrText = await extractTextOnDevice(processedFile, (s) =>
          setLoadingStatus(s)
        );
      } catch {}
    }

    try {
      setLoadingStatus("Coach is thinking…");
      const result = await api.send(activeId, text, "tutor", processedFile, clientOcrText);
      if (activeIdRef.current === activeId) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          return [...filtered, result.user, result.ai];
        });
      }
      if (onRefreshChats) await onRefreshChats(activeId);
    } catch (err) {
      alert("Tutor error: " + err.message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
      setLoadingStatus("");
      if (localImg) URL.revokeObjectURL(localImg);
    }
  };

  const handleClear = async () => {
    if (!activeId) return;
    if (
      confirm(
        "Delete this tutoring session? Your academic profile will be saved."
      )
    ) {
      await api.delChat(activeId);
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

  // No session selected yet
  if (!activeId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 bg-slate-950/80 text-center px-6 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/5">
          <GraduationCap size={32} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100">
            No Tutor Session Selected
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
            Click <strong className="text-slate-300">New Tutor Session</strong>{" "}
            in the sidebar to start a personalized coaching session, or select
            an existing one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950/80 overflow-hidden">
      {/* Top Coach Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                KODIGO Academic Coach
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50">
                Socratic Tutor
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Personalized tutoring tailored to your grades and weak spots.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/90 hover:bg-purple-600 active:bg-purple-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Award size={13} />
            <span>Manage Academic Profile</span>
            {weakSpots.length > 0 && (
              <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
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

      {/* Tutor Chat Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="my-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/5">
                <GraduationCap size={32} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  Welcome to your Academic Tutoring Coach
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  Unlike standard quiz solvers, KODIGO Tutor understands your
                  current academic standing and guides you with the Socratic
                  method, hints, and deep conceptual reinforcement.
                </p>
              </div>

              {records.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-dashed border-slate-700/80 max-w-md mx-auto text-center space-y-2.5">
                  <p className="text-xs text-slate-300">
                    You haven't set up your subjects or grades yet.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    <Award size={14} /> Set Up Academic Profile
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-w-lg mx-auto text-left">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                    Suggested Coaching Sessions
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {starterPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        className="text-left text-xs text-slate-300 hover:text-white p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 transition-all flex items-start gap-2 shadow-sm cursor-pointer"
                      >
                        <Sparkles
                          size={14}
                          className="text-purple-400 shrink-0 mt-0.5"
                        />
                        <span>{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((m) => {
            const isUser = m.sender === "user";
            return (
              <div
                key={m.id}
                className={
                  isUser
                    ? "self-end max-w-[85%] bg-slate-800 text-slate-100 rounded-2xl px-4 py-2.5 text-sm shadow-sm"
                    : "border-l-4 border-purple-500 bg-slate-900 rounded-r-xl px-4 py-3 max-w-[90%] text-slate-100 shadow-sm"
                }
              >
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-800 text-xs font-semibold text-purple-300">
                    <GraduationCap size={14} className="text-purple-400" />
                    <span>Academic Coach</span>
                  </div>
                )}
                {m.image_path && (
                  <img
                    src={resolveUrl(m.image_path)}
                    alt="Problem upload"
                    className="rounded-lg mb-2 max-h-60"
                  />
                )}
                {isUser ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <Md>{m.content}</Md>
                )}
              </div>
            );
          })}

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
      <div className="p-3 border-t border-slate-800 bg-slate-950">
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

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl px-3 py-2 focus-within:border-purple-500 transition-colors">
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
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
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
              placeholder="Ask your coach anything, request a practice problem, or paste a question..."
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32"
            />

            <button
              type="submit"
              disabled={(!input.trim() && !file) || loading || !activeId}
              className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors cursor-pointer shrink-0"
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

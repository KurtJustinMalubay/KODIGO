import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  GraduationCap,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, resolveUrl } from "../api";
import { compressImage, extractTextOnDevice } from "../utils/imageOptimizer";
import Md from "./Md";
import InputBar from "./InputBar";
import { useTextToSpeech } from "../hooks/useSpeech";

function parseTutorQuiz(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const quiz = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(quiz.questions) || !quiz.questions.length) return null;
    const questions = quiz.questions.filter(
      (item) =>
        typeof item?.question === "string" &&
        Array.isArray(item.options) &&
        item.options.length >= 2 &&
        item.options.every(
          (option) => typeof option?.id === "string" && typeof option.text === "string"
        ) &&
        typeof item.answer === "string" &&
        item.options.some(
          (option) => option.id.toUpperCase() === item.answer.toUpperCase()
        ) &&
        typeof item.explanation === "string"
    );
    if (questions.length !== quiz.questions.length) return null;
    return { title: typeof quiz.title === "string" ? quiz.title : "Practice Quiz", questions };
  } catch {
    return null;
  }
}

function TutorQuizCard({ content }) {
  const quiz = parseTutorQuiz(content);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});

  if (!quiz) {
    return (
      <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-100">
        This saved response is not a complete quiz, so it cannot be displayed. Send a new quiz prompt to generate a fresh one.
      </div>
    );
  }

  const correctCount = quiz.questions.reduce(
    (total, question, index) =>
      total +
      (revealed[index] &&
      answers[index] === question.answer.toUpperCase()
        ? 1
        : 0),
    0
  );
  const revealedCount = Object.values(revealed).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-white">{quiz.title}</h3>
        <p className="mt-1 text-[11px] text-slate-400">
          {quiz.questions.length} questions
          {revealedCount > 0 && ` · ${correctCount}/${revealedCount} correct`}
        </p>
      </div>
      {quiz.questions.map((question, index) => {
        const isRevealed = Boolean(revealed[index]);
        const correctAnswer = question.answer.toUpperCase();
        const isCorrect = answers[index] === correctAnswer;
        return (
          <section
            key={`${index}-${question.question}`}
            className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
          >
            <div className="mb-3 text-sm font-semibold text-slate-100">
              <span className="mr-1.5 text-indigo-300">{index + 1}.</span>
              <Md>{question.question}</Md>
            </div>
            <div className="space-y-2">
              {question.options.map((option) => {
                const optionId = String(option.id || "").toUpperCase();
                const selected = answers[index] === optionId;
                const correct = optionId === correctAnswer;
                const optionClass = isRevealed && correct
                  ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-100"
                  : isRevealed && selected && !correct
                    ? "border-red-500/60 bg-red-950/30 text-red-100"
                    : selected
                      ? "border-indigo-500/70 bg-indigo-950/50 text-white"
                      : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-indigo-500/50";
                return (
                  <button
                    key={optionId}
                    type="button"
                    disabled={isRevealed}
                    aria-pressed={selected}
                    onClick={() =>
                      setAnswers((previous) => ({ ...previous, [index]: optionId }))
                    }
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:cursor-default ${optionClass}`}
                  >
                    <span className="font-bold">{optionId}.</span>
                    <span className="whitespace-pre-wrap">{option.text}</span>
                  </button>
                );
              })}
            </div>
            {!isRevealed ? (
              <button
                type="button"
                onClick={() => setRevealed((previous) => ({ ...previous, [index]: true }))}
                className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                {answers[index] ? "Check answer & explanation" : "Reveal answer & explanation"}
              </button>
            ) : (
              <div
                className={`mt-3 rounded-lg border p-3 text-xs ${
                  isCorrect
                    ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-100"
                    : "border-amber-800/70 bg-amber-950/30 text-amber-100"
                }`}
              >
                <p className="font-semibold">
                  {answers[index]
                    ? isCorrect
                      ? "Correct!"
                      : "Not quite."
                    : "Answer revealed"}
                  {" "}Correct answer: {question.answer}.
                </p>
                <div className="mt-1.5 text-slate-200"><Md>{question.explanation}</Md></div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const TutorMessageItem = React.memo(function TutorMessageItem({
  message,
  showTimestamps,
}) {
  const isUser = message.sender === "user";
  const isCoaching = !isUser && message.mode === "tutor";
  const { isSpeaking, toggle: toggleTTS } = useTextToSpeech(message.id);
  const isStreaming = Boolean(message.isStreaming);
  const isQuiz = !isUser && message.mode === "tutor_quiz";
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
          : `border-l-4 ${isCoaching ? "border-violet-500" : "border-indigo-500"} bg-slate-900/95 rounded-r-2xl sm:rounded-r-xl px-3.5 sm:px-4 py-3 sm:py-3.5 max-w-[96%] sm:max-w-[90%] text-slate-100 shadow-sm leading-relaxed`
      }
    >
      {!isUser && (
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${isCoaching ? "text-violet-300" : "text-indigo-300"}`}>
            <GraduationCap size={14} className={isCoaching ? "text-violet-400" : "text-indigo-400"} />
            <span>Academic Coach</span>
          </div>
          {/* Built-in Text-to-Speech button (Always visible on Desktop & Mobile) */}
          {!isStreaming && !isQuiz && (
            <button
              type="button"
              onClick={() => toggleTTS(message.content)}
              title={isSpeaking ? "Stop speaking" : "Read aloud using device built-in speech"}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                isSpeaking
                  ? isCoaching
                    ? "text-violet-200 bg-violet-900/60 border border-violet-700/60 shadow-sm animate-pulse"
                    : "text-indigo-200 bg-indigo-900/60 border border-indigo-700/60 shadow-sm animate-pulse"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 active:bg-slate-800"
              }`}
            >
              {isSpeaking ? (
                <VolumeX size={13} className={isCoaching ? "text-violet-400" : "text-indigo-400"} />
              ) : (
                <Volume2 size={13} />
              )}
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
      ) : isStreaming && isQuiz ? (
        <div className="flex items-center gap-2 text-indigo-300 text-xs py-1">
          <Loader2 size={13} className="animate-spin text-indigo-400" />
          <span>Building your quiz...</span>
        </div>
      ) : isStreaming && !message.content ? (
        <div className={`flex items-center gap-2 text-xs py-1 ${isCoaching ? "text-violet-300" : "text-indigo-300"}`}>
          <Loader2 size={13} className={`animate-spin ${isCoaching ? "text-violet-400" : "text-indigo-400"}`} />
          <span>Coach is thinking...</span>
        </div>
      ) : !message.content ? (
        <div className="text-slate-400 italic text-xs py-1">
          No response generated. Please try again.
        </div>
      ) : isQuiz ? (
        <TutorQuizCard content={message.content} />
      ) : (
        <div className="relative">
          <Md>{message.content}</Md>
          {isStreaming && (
            <span className={`inline-block w-1.5 h-4 ml-1 ${isQuiz ? "bg-indigo-400" : "bg-violet-400"} animate-pulse rounded-sm align-middle`} />
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
  const [tutorMode, setTutorMode] = useState("quiz");
  const [quizLength, setQuizLength] = useState(5);
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
  if (subjectFilter !== "none") {
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
  }

  const handleSend = async (
    contentToSend = "",
    userFile = null,
    selectedMode = tutorMode,
    selectedQuizLength = quizLength
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
          clientOcrText = await extractTextOnDevice(processedFile);
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
      const result = await api.send(
        targetSessionId,
        text,
        apiMode,
        processedFile,
        clientOcrText,
        subjectFilter,
        onChunk,
        selectedQuizLength
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
      if (localImg) URL.revokeObjectURL(localImg);
    }
  };

  const starterPrompts = tutorMode === "quiz"
    ? [
        weakSpots.length > 0
          ? `Create a practice quiz about ${weakSpots[0].subject}, focusing on ${weakSpots[0].assessment}.`
          : "Create a practice quiz about a subject I am studying.",
        "Build a quiz about the fundamentals of my selected subject.",
      ]
    : [
    ...(weakSpots.length > 0
      ? [
          `Explain the foundational concepts I might have missed in ${weakSpots[0].subject}.`,
        ]
      : [
          "Help me understand a topic from one of my subjects.",
        ]),
    "Give me a challenging practice problem with hints instead of the answer.",
    "Help me design an effective study schedule for my upcoming exams.",
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950/80 text-slate-100">
      {/* Weakness Alert Strip */}
      {weakSpots.length > 0 && (
        <div className="px-3 sm:px-4 py-2 bg-amber-950/40 border-b border-amber-900/30 flex items-center justify-between gap-2 overflow-x-auto select-none">
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
      <div className="px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2 shrink-0">
        <BookOpen size={13} className="text-violet-400 shrink-0" />
        <span className="text-[11px] text-slate-400 font-medium shrink-0">Context:</span>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="w-full min-w-0 max-w-xs flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-500 enabled:cursor-pointer disabled:opacity-70"
        >
          <option value="all">{records.length ? "All Subjects" : "No subjects in profile"}</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>{r.subject}</option>
          ))}
          <option value="none">No context</option>
        </select>
      </div>

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
                  {tutorMode === "quiz" ? "✨ Start a Practice Quiz" : "✨ Suggested Coaching"}
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
        quizLength={quizLength}
        setQuizLength={setQuizLength}
      />
    </div>
  );
}

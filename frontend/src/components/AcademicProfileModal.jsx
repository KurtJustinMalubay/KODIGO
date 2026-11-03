import React, { useState } from "react";
import {
  AlertTriangle,
  Award,
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";
import Modal from "./Modal";

const ASSESSMENT_TYPES = ["Quiz", "Activity", "Exam", "Assignment", "Project"];

export default function AcademicProfileModal({
  records = [],
  onSaveRecord,
  onDeleteRecord,
  onClose,
}) {
  const [editingId, setEditingId] = useState(null);
  const [subject, setSubject] = useState("");
  const [targetGrade, setTargetGrade] = useState("");
  const [currentStanding, setCurrentStanding] = useState("");
  const [notes, setNotes] = useState("");
  const [assessments, setAssessments] = useState([]);

  // Assessment input fields
  const [assType, setAssType] = useState("Quiz");
  const [assTitle, setAssTitle] = useState("");
  const [assScore, setAssScore] = useState("");
  const [assTotal, setAssTotal] = useState("");
  const [assDate, setAssDate] = useState("");

  const [expandedId, setExpandedId] = useState(null);

  const startNew = () => {
    setEditingId("new");
    setSubject("");
    setTargetGrade("");
    setCurrentStanding("");
    setNotes("");
    setAssessments([]);
    setAssType("Quiz");
    setAssTitle("");
    setAssScore("");
    setAssTotal("");
    setAssDate("");
  };

  const startEdit = (rec) => {
    setEditingId(rec.id);
    setSubject(rec.subject || "");
    setTargetGrade(rec.target_grade || "");
    setCurrentStanding(rec.current_standing || "");
    setNotes(rec.notes || "");
    setAssessments(rec.assessments || []);
    setAssType("Quiz");
    setAssTitle("");
    setAssScore("");
    setAssTotal("");
    setAssDate("");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const addAssessment = () => {
    const trimmedTitle = assTitle.trim();
    if (!trimmedTitle) return;
    if (assScore === "" || assTotal === "") return;

    const scoreNum = Number(assScore);
    const totalNum = Number(assTotal);
    if (isNaN(scoreNum) || isNaN(totalNum) || totalNum <= 0) return;

    const newAss = {
      id: `ass_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: assType,
      title: trimmedTitle,
      score: scoreNum,
      total: totalNum,
      date: assDate || new Date().toISOString().slice(0, 10),
    };
    setAssessments((prev) => [...prev, newAss]);
    setAssTitle("");
    setAssScore("");
    setAssTotal("");
    setAssDate("");
  };

  const removeAssessment = (index) => {
    setAssessments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!subject.trim()) return;

    await onSaveRecord({
      id: editingId === "new" ? undefined : editingId,
      subject: subject.trim(),
      target_grade: targetGrade.trim(),
      current_standing: currentStanding.trim(),
      notes: notes.trim(),
      assessments,
    });
    setEditingId(null);
  };

  // Automated weakness analysis stats across all records
  let totalAssessments = 0;
  let totalScoreSum = 0;
  let totalMaxSum = 0;
  let weakPointsCount = 0;

  records.forEach((r) => {
    (r.assessments || []).forEach((a) => {
      const s = Number(a.score) || 0;
      const t = Number(a.total) || 0;
      if (t > 0) {
        totalAssessments++;
        totalScoreSum += s;
        totalMaxSum += t;
        if (s / t < 0.75) weakPointsCount++;
      }
    });
  });

  const overallAvg =
    totalMaxSum > 0 ? Math.round((totalScoreSum / totalMaxSum) * 100) : null;

  return (
    <Modal title="Academic Profile & Performance Hub" onClose={onClose}>
      <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
        {/* Performance Overview Banner */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 text-center">
          <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Subjects</div>
            <div className="text-lg font-bold text-slate-100">{records.length}</div>
          </div>
          <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Average Score</div>
            <div className="text-lg font-bold text-indigo-400">
              {overallAvg !== null ? `${overallAvg}%` : "—"}
            </div>
          </div>
          <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Weak Spots</div>
            <div
              className={`text-lg font-bold ${
                weakPointsCount > 0 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {weakPointsCount}
            </div>
          </div>
        </div>

        {/* Action Header */}
        {!editingId && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400 font-medium">
              Your Subjects & Assessments
            </span>
            <button
              type="button"
              onClick={startNew}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add Subject
            </button>
          </div>
        )}

        {/* Add / Edit Form */}
        {editingId && (
          <form
            onSubmit={handleSave}
            className="p-4 rounded-xl bg-slate-800/90 border border-indigo-500/40 space-y-4 animate-[fadeIn_.2s]"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap size={15} />
                {editingId === "new" ? "New Subject Record" : `Edit ${subject}`}
              </h3>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">
                Subject Name *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Data Structures and Algorithms"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">
                  Current Grade / Standing
                </label>
                <input
                  type="text"
                  value={currentStanding}
                  onChange={(e) => setCurrentStanding(e.target.value)}
                  placeholder="e.g., 2.25, 4.3, or 78%"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">
                  Target Grade
                </label>
                <input
                  type="text"
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(e.target.value)}
                  placeholder="e.g., 1.0, 5.0, or 95%"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">
                Struggle Areas & Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g., I struggle with turning my logic into code, tree recursion, and balancing."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Assessment Input Section */}
            <div className="pt-2 border-t border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Award size={14} className="text-indigo-400" />
                  Quizzes, Activities & Exams ({assessments.length})
                </label>
              </div>

              {/* Added Assessments List */}
              {assessments.length > 0 && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {assessments.map((ass, idx) => {
                    const score = Number(ass.score) || 0;
                    const total = Number(ass.total) || 1;
                    const pct = Math.round((score / total) * 100);
                    const isWeak = pct < 75;

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-700/70 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isWeak ? (
                            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                          ) : (
                            <Check size={13} className="text-emerald-400 shrink-0" />
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-semibold shrink-0">
                            {ass.type || "Quiz"}
                          </span>
                          <span className="text-slate-200 truncate font-medium">
                            {ass.title}
                          </span>
                          <span className="text-slate-400 font-mono shrink-0">
                            {score}/{total} ({pct}%)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAssessment(idx)}
                          className="text-slate-400 hover:text-red-400 p-1 transition-colors ml-2"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Redesigned Roomy Assessment Input Panel */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300">
                    Add Quiz or Activity:
                  </span>
                  {/* Assessment Type Pills */}
                  <div className="flex items-center gap-1">
                    {ASSESSMENT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAssType(type)}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                          assType === type
                            ? "bg-indigo-600 text-white font-semibold shadow-sm"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title Input */}
                <input
                  type="text"
                  value={assTitle}
                  onChange={(e) => setAssTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAssessment();
                    }
                  }}
                  placeholder={`Title (e.g. ${assType} 2 - Binary Trees)`}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />

                {/* Score / Total row + percentage preview */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Score
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={assScore}
                      onChange={(e) => setAssScore(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAssessment();
                        }
                      }}
                      placeholder="e.g. 18"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 text-center"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      Total Points
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={assTotal}
                      onChange={(e) => setAssTotal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAssessment();
                        }
                      }}
                      placeholder="e.g. 20"
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold focus:outline-none focus:border-indigo-500 text-center"
                    />
                  </div>
                </div>

                {/* Percentage preview + Add button */}
                <div className="flex items-center gap-2">
                  {assScore !== "" && assTotal !== "" && Number(assTotal) > 0 && (
                    <div
                      className={`text-sm font-mono px-3 py-2 rounded-lg font-bold ${
                        Math.round((Number(assScore) / Number(assTotal)) * 100) < 75
                          ? "bg-amber-950/60 text-amber-300 border border-amber-800/40"
                          : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                      }`}
                    >
                      {Math.round((Number(assScore) / Number(assTotal)) * 100)}%
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addAssessment}
                    disabled={!assTitle.trim() || assScore === "" || assTotal === ""}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2 px-3.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Add {assType}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Save Subject
              </button>
            </div>
          </form>
        )}

        {/* Existing Records List */}
        {!editingId && records.length === 0 && (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-800 text-slate-400 space-y-2">
            <GraduationCap size={32} className="mx-auto text-slate-500 mb-1" />
            <div className="text-sm font-semibold text-slate-300">
              No subjects added yet
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Add your current college or high school subjects and past quiz/activity scores so
              KODIGO Tutor can proactively coach you on your weak points.
            </p>
            <button
              type="button"
              onClick={startNew}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add First Subject
            </button>
          </div>
        )}

        {!editingId && records.length > 0 && (
          <div className="space-y-3">
            {records.map((rec) => {
              const isExpanded = expandedId === rec.id;
              const assList = rec.assessments || [];
              let recScore = 0;
              let recTotal = 0;
              let recWeakCount = 0;

              assList.forEach((a) => {
                const s = Number(a.score) || 0;
                const t = Number(a.total) || 0;
                if (t > 0) {
                  recScore += s;
                  recTotal += t;
                  if (s / t < 0.75) recWeakCount++;
                }
              });

              const recAvg =
                recTotal > 0 ? Math.round((recScore / recTotal) * 100) : null;

              return (
                <div
                  key={rec.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden transition-all"
                >
                  <div
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none"
                    onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-indigo-800/40 flex items-center justify-center shrink-0">
                        <BookMarked size={16} className="text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-100 truncate">
                          {rec.subject}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          {rec.current_standing && (
                            <span>Standing: <b className="text-slate-300">{rec.current_standing}</b></span>
                          )}
                          {rec.target_grade && (
                            <span>Target: <b className="text-emerald-400">{rec.target_grade}</b></span>
                          )}
                          {recAvg !== null && (
                            <span>Avg: <b className="text-indigo-300">{recAvg}%</b></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {recWeakCount > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/40 flex items-center gap-1">
                          <AlertTriangle size={11} /> {recWeakCount} weak
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(rec);
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${rec.subject}?`)) {
                            onDeleteRecord(rec.id);
                          }
                        }}
                        className="text-xs text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {/* Expanded Assessment & Notes View */}
                  {isExpanded && (
                    <div className="p-3.5 border-t border-slate-800/80 bg-slate-950/50 space-y-2.5 text-xs animate-[fadeIn_.2s]">
                      {rec.notes && (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                          <span className="font-semibold text-slate-400 block mb-0.5">
                            Struggle Areas & Focus:
                          </span>
                          {rec.notes}
                        </div>
                      )}

                      <div>
                        <span className="font-semibold text-slate-400 block mb-1">
                          Assessments & Quiz History:
                        </span>
                        {assList.length === 0 ? (
                          <div className="text-slate-500 italic">No assessments added.</div>
                        ) : (
                          <div className="space-y-1">
                            {assList.map((a, idx) => {
                              const s = Number(a.score) || 0;
                              const t = Number(a.total) || 1;
                              const pct = Math.round((s / t) * 100);
                              const isWeak = pct < 75;

                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded uppercase font-semibold">
                                      {a.type || "Quiz"}
                                    </span>
                                    {isWeak ? (
                                      <span className="text-[10px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded border border-red-800 font-semibold">
                                        Needs Review
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800 font-semibold">
                                        Good
                                      </span>
                                    )}
                                    <span className="font-medium text-slate-200">
                                      {a.title}
                                    </span>
                                  </div>
                                  <span className="text-slate-400 font-mono">
                                    {s}/{t} ({pct}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

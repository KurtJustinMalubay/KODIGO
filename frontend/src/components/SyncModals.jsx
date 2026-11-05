import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

/** Modal shown when both local and Drive have data */
export function SyncConflictModal({ conflictInfo, onResolve, onClose }) {
  const { localInfo, driveInfo } = conflictInfo || {};
  const [pendingResolution, setPendingResolution] = useState(null);

  const formatDate = (iso) => {
    if (!iso) return "unknown";
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-amber-700/40 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3 bg-amber-950/40">
          <AlertTriangle size={20} className="text-amber-400 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-white">Sync Conflict Detected</h2>
            <p className="text-[11px] text-amber-300/80">Both local and Drive have data.</p>
          </div>
        </div>

        {/* Info rows */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <div className="text-xs text-slate-300">
              <div className="font-semibold text-white mb-0.5">📱 This Device</div>
              <div>{localInfo?.chatCount ?? 0} chats · {localInfo?.academicCount ?? 0} subjects</div>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <div className="text-xs text-slate-300">
              <div className="font-semibold text-white mb-0.5">☁️ Google Drive</div>
              <div>Last saved: {formatDate(driveInfo?.modifiedAt)}</div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-5 pb-5 space-y-2">
          <button
            type="button"
            onClick={() => setPendingResolution("merge")}
            className="w-full flex flex-col items-start px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600/90 to-indigo-600/90 hover:from-purple-500 hover:to-indigo-500 text-white transition-all cursor-pointer"
          >
            <span className="text-xs font-bold">Merge Both</span>
            <span className="text-[10px] text-purple-200 mt-0.5">Combine all data, newer records win on conflict</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPendingResolution("keep-local")}
              className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs transition-colors cursor-pointer border border-slate-700"
            >
              <span className="font-semibold">Keep Local</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Overwrite Drive with this device's data</span>
            </button>

            <button
              type="button"
              onClick={() => setPendingResolution("use-drive")}
              className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs transition-colors cursor-pointer border border-slate-700"
            >
              <span className="font-semibold">Use Drive</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Replace local with Drive data</span>
            </button>
          </div>
        </div>
      </div>
      {pendingResolution && (
        <ConfirmDialog
          title={
            pendingResolution === "use-drive"
              ? "Replace this device’s data?"
              : pendingResolution === "keep-local"
                ? "Overwrite Drive data?"
                : "Merge device and Drive data?"
          }
          message={
            pendingResolution === "use-drive"
              ? "This replaces the chats, academic profile, and settings on this device with the Google Drive backup."
              : pendingResolution === "keep-local"
                ? "This replaces the existing Google Drive backup with the data currently on this device."
                : "This combines data from this device and Google Drive. When records conflict, the newer record wins."
          }
          confirmLabel={
            pendingResolution === "use-drive"
              ? "Replace local data"
              : pendingResolution === "keep-local"
                ? "Overwrite Drive"
                : "Merge data"
          }
          danger={pendingResolution !== "merge"}
          onCancel={() => setPendingResolution(null)}
          onConfirm={() => {
            onResolve(pendingResolution);
            setPendingResolution(null);
          }}
        />
      )}
    </div>
  );
}

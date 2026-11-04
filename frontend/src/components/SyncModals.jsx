import React, { useState } from "react";
import {
  AlertTriangle,
  Cloud,
  FolderOpen,
  FolderPlus,
  Loader2,
  Search,
} from "lucide-react";

/** Modal for picking (or creating) a Google Drive folder */
export function FolderPickerModal({ folders = [], onPick, onCreateNew, onClose }) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("KODIGO Sync");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreateNew(newName.trim());
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Cloud size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Choose a Drive Folder</h2>
            <p className="text-[11px] text-slate-400">KODIGO will store sync files here.</p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search folders…"
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 outline-none"
            />
          </div>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 max-h-56 space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">No folders found.</p>
          )}
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <FolderOpen size={16} className="text-yellow-400 shrink-0" />
              <span className="text-xs text-slate-200 truncate">{f.name}</span>
            </button>
          ))}
        </div>

        {/* Create new folder */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-800 space-y-2">
          {showCreate ? (
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Folder name"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors text-xs cursor-pointer"
            >
              <FolderPlus size={15} />
              Create new folder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal shown when both local and Drive have data */
export function SyncConflictModal({ conflictInfo, onResolve, onClose }) {
  const { localInfo, driveInfo } = conflictInfo || {};

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
            onClick={() => onResolve("merge")}
            className="w-full flex flex-col items-start px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600/90 to-indigo-600/90 hover:from-purple-500 hover:to-indigo-500 text-white transition-all cursor-pointer"
          >
            <span className="text-xs font-bold">Merge Both</span>
            <span className="text-[10px] text-purple-200 mt-0.5">Combine all data, newer records win on conflict</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onResolve("keep-local")}
              className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs transition-colors cursor-pointer border border-slate-700"
            >
              <span className="font-semibold">Keep Local</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Overwrite Drive with this device's data</span>
            </button>

            <button
              type="button"
              onClick={() => onResolve("use-drive")}
              className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs transition-colors cursor-pointer border border-slate-700"
            >
              <span className="font-semibold">Use Drive</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Replace local with Drive data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

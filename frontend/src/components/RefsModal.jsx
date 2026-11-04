import React, { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, HardDrive } from "lucide-react";
import { api } from "../api";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";

export default function RefsModal({ scope, title, onClose }) {
  const [references, setReferences] = useState([]);
  const [busy, setBusy] = useState(false);
  const [referenceToDelete, setReferenceToDelete] = useState(null);
  const fileRef = useRef(null);

  const load = async () => setReferences(await api.refs(scope));

  useEffect(() => {
    load();
  }, [scope]);

  const upload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      await api.addRef(scope, file);
      await load();
    } catch (error) {
      alert("Failed to add reference: " + error.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="mb-3.5 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <HardDrive size={13} />
          <span>Saved directly on this device</span>
        </span>
        <span>{references.length} reference{references.length === 1 ? "" : "s"}</span>
      </div>

      <button
        onClick={() => fileRef.current.click()}
        disabled={busy}
        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2.5 text-sm w-full font-medium transition-colors disabled:opacity-50 mb-4"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        <span>{busy ? "Processing & Extracting text…" : "Upload reference (PDF / image / txt)"}</span>
      </button>
      <input ref={fileRef} type="file" hidden onChange={upload} />

      {references.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
          No references attached yet. Upload notes, formulas, or lecture slides to provide context to the AI.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {references.map((reference) => (
            <div
              key={reference.id}
              className="flex items-center gap-3 py-2 px-3 bg-slate-800/50 hover:bg-slate-800/80 rounded-lg border border-slate-700/60 text-sm transition-colors"
            >
              <input
                type="checkbox"
                checked={reference.is_active}
                onChange={async (event) => {
                  await api.toggleRef(scope, reference.id, event.target.checked);
                  load();
                }}
                className="rounded accent-indigo-600 cursor-pointer"
              />
              <span
                className={`flex-1 truncate ${
                  reference.is_active ? "text-slate-200" : "text-slate-500 line-through"
                }`}
                title={reference.filename}
              >
                {reference.filename}
              </span>
              <button
                type="button"
                onClick={() => setReferenceToDelete(reference)}
                className="text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
                title="Delete reference"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {referenceToDelete && (
        <ConfirmDialog
          title="Delete reference?"
          message={`“${referenceToDelete.filename}” will be permanently deleted from this device.`}
          confirmLabel="Delete reference"
          danger
          onCancel={() => setReferenceToDelete(null)}
          onConfirm={async () => {
            await api.delRef(scope, referenceToDelete.id);
            await load();
            setReferenceToDelete(null);
          }}
        />
      )}
    </Modal>
  );
}

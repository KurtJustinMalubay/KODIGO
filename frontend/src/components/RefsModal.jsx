import React, { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import Modal from "./Modal";

export default function RefsModal({ scope, title, onClose }) {
  const [references, setReferences] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const load = async () => setReferences(await api.refs(scope));
  useEffect(() => { load(); }, [scope]);
  const upload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setBusy(true);
    try { await api.addRef(scope, file); await load(); } catch (error) { alert(error.message); }
    setBusy(false);
    event.target.value = "";
  };
  return (
    <Modal title={title} onClose={onClose}>
      <button onClick={() => fileRef.current.click()} disabled={busy}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-2 text-sm mb-4 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Upload file (PDF / image / txt)
      </button>
      <input ref={fileRef} type="file" hidden onChange={upload} />
      {references.length === 0 && <div className="text-sm text-slate-500">No references yet.</div>}
      {references.map((reference) => (
        <div key={reference.id} className="flex items-center gap-3 py-2 border-b border-slate-800 text-sm">
          <input type="checkbox" checked={reference.is_active} onChange={async (event) => { await api.toggleRef(scope, reference.id, event.target.checked); load(); }} />
          <span className={`flex-1 truncate ${reference.is_active ? "" : "text-slate-500 line-through"}`}>{reference.filename}</span>
          <button onClick={async () => { await api.delRef(scope, reference.id); load(); }} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
        </div>
      ))}
    </Modal>
  );
}

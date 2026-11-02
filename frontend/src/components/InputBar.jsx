import React, { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";

export default function InputBar({ mode, setMode, onSend, loading }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const textarea = useRef(null);
  const submit = () => {
    if (loading || (!text.trim() && !file)) return;
    onSend(text.trim(), file);
    setText("");
    setFile(null);
    if (textarea.current) textarea.current.style.height = "auto";
  };
  return (
    <div className="border-t border-slate-800 bg-slate-950 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        {file && (
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 rounded-full px-3 py-1 w-fit mb-2">
            {file.name}<button onClick={() => setFile(null)}><X size={12} /></button>
          </div>
        )}
        <div className="flex items-end gap-2 bg-slate-900 rounded-2xl px-3 py-2 border border-slate-800 focus-within:border-indigo-500">
          <button onClick={() => fileRef.current.click()} className="p-2 text-slate-400 hover:text-white"><Paperclip size={18} /></button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(event) => setFile(event.target.files[0])} />
          <textarea ref={textarea} rows={1} value={text} placeholder="Drop a question or quiz image…"
            onChange={(event) => { setText(event.target.value); event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight, 160) + "px"; }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            onPaste={(event) => { const image = [...event.clipboardData.files].find((item) => item.type.startsWith("image/")); if (image) setFile(image); }}
            className="flex-1 bg-transparent outline-none resize-none text-sm text-slate-100 py-2" />
          <button onClick={submit} disabled={loading}
            className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,.6)] disabled:opacity-50"><Send size={16} /></button>
        </div>
        <div className="flex items-center gap-1 mt-2 bg-slate-900 rounded-full p-1 w-fit text-xs">
          {["quiz", "chat"].map((item) => (
            <button key={item} onClick={() => setMode(item)}
              className={`px-3 py-1 rounded-full capitalize ${mode === item ? (item === "quiz" ? "bg-emerald-600" : "bg-indigo-600") + " text-white" : "text-slate-400"}`}>
              {item} Mode
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

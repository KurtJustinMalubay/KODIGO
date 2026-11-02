import React from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children, dismissible = true }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={dismissible ? onClose : undefined}>
      <div className="bg-slate-900 text-slate-100 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          {dismissible && <button onClick={onClose} aria-label="Close"><X size={18} /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

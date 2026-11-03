import React from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children, dismissible = true }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-end sm:items-center sm:p-4 animate-[fadeIn_.15s]"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className="bg-slate-900 border border-slate-800 text-slate-100 w-full rounded-t-3xl sm:rounded-2xl sm:max-w-lg sm:mx-auto max-h-[92vh] flex flex-col p-5 sm:p-5 shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center mb-3 -mt-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-800/80 shrink-0">
          <h2 className="font-bold text-base text-slate-100 truncate pr-2">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">{children}</div>
      </div>
    </div>
  );
}

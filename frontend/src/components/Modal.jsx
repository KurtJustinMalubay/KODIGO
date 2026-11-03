import React from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children, dismissible = true }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-[fadeIn_.15s]"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] overflow-y-auto p-4 sm:p-5 shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-800/80 shrink-0">
          <h2 className="font-bold text-sm sm:text-base text-slate-100 truncate pr-2">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

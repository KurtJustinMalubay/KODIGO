import React from "react";

const inputClass =
  "w-full bg-slate-800 rounded-lg px-3 py-2.5 text-sm outline-none border border-slate-700 focus:border-indigo-500 transition-colors min-h-[44px]";

function Field({ label, children }) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="font-medium text-slate-300 text-[13px]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function GeneralSettingsFields({ settings, setSettings }) {
  const set = (key) => (event) =>
    setSettings((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-4">
      <Field label="Chat Font Size">
        <select
          className={inputClass}
          value={settings.font_size || "medium"}
          onChange={set("font_size")}
        >
          <option value="small">Small (13px)</option>
          <option value="medium">Medium (Default, 14px)</option>
          <option value="large">Large (16px)</option>
          <option value="xlarge">Extra Large (18px)</option>
        </select>
      </Field>

      <Field label="Theme">
        <select
          className={inputClass}
          value={settings.theme || "dark"}
          onChange={set("theme")}
        >
          <option value="dark">Slate Dark (Default)</option>
          <option value="amoled">AMOLED Pitch Black</option>
          <option value="midnight">Midnight Indigo</option>
        </select>
      </Field>

      <Field label="Message Timestamps">
        <select
          className={inputClass}
          value={settings.show_timestamps ? "true" : "false"}
          onChange={(e) =>
            setSettings((curr) => ({
              ...curr,
              show_timestamps: e.target.value === "true",
            }))
          }
        >
          <option value="false">Hidden (Cleaner)</option>
          <option value="true">Enabled</option>
        </select>
      </Field>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 mt-4 flex items-center gap-3">
        <img
          src="/kodigo.png"
          alt="KODIGO Logo"
          className="w-10 h-10 rounded-xl object-contain shadow-sm shrink-0 ring-1 ring-slate-800"
        />
        <div>
          <h4 className="text-xs font-semibold text-slate-200 mb-0.5">
            KODIGO
          </h4>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Created and developed by{" "}
            <span className="font-semibold text-indigo-400">
              Kurt Justin J. Malubay
            </span>{" "}
            (SASHIMI24).
          </p>
        </div>
      </div>
    </div>
  );
}

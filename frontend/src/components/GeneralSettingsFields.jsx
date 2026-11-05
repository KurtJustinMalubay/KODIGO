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
  const setBoolean = (key) => (event) =>
    setSettings((current) => ({ ...current, [key]: event.target.checked }));

  return (
    <div className="space-y-4">
      <Field label="Recent Chat Context">
        <select
          className={inputClass}
          value={settings.history_limit || 10}
          onChange={set("history_limit")}
        >
          <option value={5}>5 messages</option>
          <option value={10}>10 messages (Default)</option>
          <option value={20}>20 messages</option>
        </select>
      </Field>

      <Field label="Reference & Profile Context">
        <select
          className={inputClass}
          value={settings.context_limit || 12000}
          onChange={set("context_limit")}
        >
          <option value={12000}>12,000 characters (Default)</option>
          <option value={24000}>24,000 characters</option>
          <option value={48000}>48,000 characters</option>
        </select>
      </Field>

      <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 cursor-pointer">
        <span className="text-sm font-medium text-slate-200">
          Message timestamps
        </span>
        <input
          type="checkbox"
          checked={Boolean(settings.show_timestamps)}
          onChange={setBoolean("show_timestamps")}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-11 shrink-0 rounded-full bg-slate-700 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-indigo-600 peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-400"
        />
      </label>
    </div>
  );
}

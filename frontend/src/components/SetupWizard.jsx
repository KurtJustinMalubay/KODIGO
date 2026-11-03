import React, { useState } from "react";
import Modal from "./Modal";
import SettingsFields from "./SettingsFields";

export default function SetupWizard({ savedSettings, onComplete }) {
  const [settings, setSettings] = useState({
    provider:
      savedSettings.provider === "ollama"
        ? "gemini"
        : savedSettings.provider || "gemini",
    model_name:
      savedSettings.provider === "ollama"
        ? "gemini-2.0-flash"
        : savedSettings.model_name || "gemini-2.0-flash",
    ollama_url: savedSettings.ollama_url || "http://localhost:11434",
    cloud_api_key: savedSettings.cloud_api_key || "",
    key_mode:
      savedSettings.key_mode ||
      (savedSettings.cloud_api_key ? "custom" : "free"),
    ocr_provider: savedSettings.ocr_provider || "paddleocr",
    ocr_api_key: "",
    default_mode: savedSettings.default_mode || "quiz",
    has_key: savedSettings.has_key,
    has_ocr_key: savedSettings.has_ocr_key,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chooseConnection = (connection) => {
    setSettings((current) => ({
      ...current,
      provider:
        connection === "offline"
          ? "ollama"
          : current.provider === "ollama"
          ? "gemini"
          : current.provider,
      model_name:
        connection === "offline"
          ? "llama3"
          : current.provider === "ollama"
          ? "gemini-2.0-flash"
          : current.model_name,
    }));
  };

  const save = async () => {
    if (
      settings.provider !== "ollama" &&
      settings.key_mode === "custom" &&
      !settings.cloud_api_key &&
      !settings.has_key
    ) {
      setError("Enter your API key or switch to Free Tier.");
      return;
    }
    if (!settings.model_name.trim()) {
      setError("Choose or enter a model name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onComplete({ ...settings, setup_complete: true });
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="AI Setup" onClose={() => {}} dismissible={false}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { value: "online", title: "Online", detail: "Gemini / OpenAI" },
            { value: "offline", title: "Offline", detail: "Local Ollama" },
          ].map((choice) => {
            const selected =
              choice.value === (settings.provider === "ollama" ? "offline" : "online");
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => chooseConnection(choice.value)}
                className={`text-left rounded-xl border p-3 min-h-[56px] transition-all cursor-pointer ${
                  selected
                    ? "border-indigo-500 bg-indigo-950/60 shadow-sm"
                    : "border-slate-800 bg-slate-900/60 hover:bg-slate-800/80"
                }`}
              >
                <span className="block text-sm font-semibold text-slate-100">{choice.title}</span>
                <span className="block text-[11px] text-slate-400 mt-0.5">{choice.detail}</span>
              </button>
            );
          })}
        </div>

        <div className="py-1">
          <SettingsFields
            settings={settings}
            setSettings={setSettings}
            connectionMode={settings.provider === "ollama" ? "offline" : "online"}
          />
        </div>

        {error && <p role="alert" className="text-xs text-red-400 font-medium">{error}</p>}

        <div className="pt-2 border-t border-slate-800/80">
          <button
            disabled={saving}
            onClick={save}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 font-semibold text-white rounded-xl px-4 py-3 text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "Saving…" : "Finish Setup"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

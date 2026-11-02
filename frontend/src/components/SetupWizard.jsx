import React, { useState } from "react";
import Modal from "./Modal";
import SettingsFields from "./SettingsFields";

export default function SetupWizard({ savedSettings, onComplete }) {
  const [settings, setSettings] = useState({
    provider: savedSettings.provider === "ollama" ? "openai" : savedSettings.provider,
    model_name: savedSettings.provider === "ollama"
      ? "gpt-4o-mini"
      : savedSettings.model_name || "gpt-4o-mini",
    ollama_url: savedSettings.ollama_url || "http://localhost:11434",
    cloud_api_key: "",
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
      provider: connection === "offline" ? "ollama" : current.provider === "ollama" ? "openai" : current.provider,
      model_name: connection === "offline" ? "llama3" : current.provider === "ollama" ? "gpt-4o-mini" : current.model_name,
    }));
  };
  const save = async () => {
    if (settings.provider !== "ollama" && !settings.cloud_api_key && !settings.has_key) {
      setError("Enter an API key to use an online AI model.");
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
    <Modal title="Welcome to KODIGO — set up your AI" onClose={() => {}} dismissible={false}>
      <p className="text-sm text-slate-400 mb-4">Choose where KODIGO should run its AI model. You can change these settings later.</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { value: "online", title: "Online", detail: "Use a cloud AI provider" },
          { value: "offline", title: "Offline", detail: "Use Ollama on this device" },
        ].map((choice) => {
          const selected = choice.value === (settings.provider === "ollama" ? "offline" : "online");
          return (
            <button key={choice.value} type="button" onClick={() => chooseConnection(choice.value)}
              className={`text-left rounded-xl border p-3 ${selected ? "border-indigo-500 bg-indigo-950/50" : "border-slate-700 bg-slate-800"}`}>
              <span className="block text-sm font-medium">{choice.title}</span>
              <span className="block text-xs text-slate-400 mt-1">{choice.detail}</span>
            </button>
          );
        })}
      </div>
      <SettingsFields settings={settings} setSettings={setSettings}
        connectionMode={settings.provider === "ollama" ? "offline" : "online"} />
      {error && <p role="alert" className="text-sm text-red-300 mb-3">{error}</p>}
      <button disabled={saving} onClick={save}
        className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm w-full disabled:opacity-50">
        {saving ? "Saving…" : "Finish setup"}
      </button>
    </Modal>
  );
}

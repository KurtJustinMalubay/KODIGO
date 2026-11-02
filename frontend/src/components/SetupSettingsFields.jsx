import React, { useEffect, useState } from "react";
import { api } from "../api";

const inputClass =
  "w-full bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none border border-slate-700 focus:border-indigo-500 transition-colors";

function Field({ label, hint, children }) {
  return (
    <label className="block mb-3.5 text-xs text-slate-400">
      <span className="font-medium text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-slate-500 text-[11px] leading-relaxed">{hint}</p>}
    </label>
  );
}

export default function SetupSettingsFields({
  settings,
  setSettings,
  includeMode = false,
  connectionMode = null,
}) {
  const [models, setModels] = useState([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);

  const set = (key) => (event) =>
    setSettings((current) => ({ ...current, [key]: event.target.value }));

  const loadModels = async () => {
    setModelsBusy(true);
    setModelsError("");
    try {
      const result = await api.models({
        provider: settings.provider,
        cloud_api_key: settings.cloud_api_key,
        ollama_url: settings.ollama_url,
      });
      setModels(result.models);
      if (result.models.includes(settings.model_name)) setUseCustomModel(false);
    } catch (error) {
      setModelsError(error.message);
    }
    setModelsBusy(false);
  };

  useEffect(() => {
    loadModels();
  }, [settings.provider]);

  const changeProvider = (event) => {
    const provider = event.target.value;
    const defaultModels = {
      ollama: "llama3",
      openai: "gpt-4o-mini",
      gemini: "gemini-2.0-flash",
    };
    setSettings((current) => ({
      ...current,
      provider,
      model_name:
        current.provider === provider
          ? current.model_name
          : defaultModels[provider] || "",
    }));
    setModels([]);
    setUseCustomModel(false);
  };

  return (
    <div className="space-y-1">
      {connectionMode === "offline" ? (
        <Field label="AI Provider">
          <div className={`${inputClass} text-slate-300`}>Ollama (Offline)</div>
        </Field>
      ) : (
        <Field label="AI Provider">
          <select className={inputClass} value={settings.provider} onChange={changeProvider}>
            {connectionMode !== "online" && <option value="ollama">Ollama (Offline)</option>}
            <option value="openai">OpenAI (Online)</option>
            <option value="gemini">Gemini (Online)</option>
          </select>
        </Field>
      )}

      <Field label="Model">
        <div className="flex gap-2">
          <select
            className={`${inputClass} min-w-0 flex-1`}
            value={useCustomModel ? "__custom__" : settings.model_name}
            onChange={(event) => {
              if (event.target.value === "__custom__") {
                setUseCustomModel(true);
              } else {
                setUseCustomModel(false);
                setSettings((current) => ({
                  ...current,
                  model_name: event.target.value,
                }));
              }
            }}
          >
            {settings.model_name &&
              !models.includes(settings.model_name) &&
              !useCustomModel && (
                <option value={settings.model_name}>
                  {settings.model_name} (current)
                </option>
              )}
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            <option value="__custom__">Enter model name…</option>
          </select>
          <button
            type="button"
            onClick={loadModels}
            disabled={modelsBusy}
            className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 text-xs disabled:opacity-50 transition-colors"
          >
            {modelsBusy ? "Loading…" : "Refresh"}
          </button>
        </div>
        {useCustomModel && (
          <input
            className={`${inputClass} mt-2`}
            value={settings.model_name}
            onChange={set("model_name")}
            placeholder="Enter exact model ID"
          />
        )}
        {modelsError ? (
          <p className="mt-1 text-xs text-amber-300">
            {modelsError}. Enter an API key if required, then refresh.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Choose an available model or enter a custom model ID.
          </p>
        )}
      </Field>

      {settings.provider === "ollama" ? (
        <Field label="Ollama Endpoint URL">
          <input
            className={inputClass}
            value={settings.ollama_url}
            onChange={set("ollama_url")}
            placeholder="http://localhost:11434"
          />
        </Field>
      ) : (
        <Field
          label="Cloud API Key"
          hint="Your API key is stored privately on this device's browser and is never shared with other users."
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={settings.cloud_api_key || ""}
            onChange={set("cloud_api_key")}
            placeholder={settings.cloud_api_key ? "•••••••• (Saved on this device)" : "Paste your API key"}
          />
        </Field>
      )}

      <Field label="Image OCR">
        <select
          className={inputClass}
          value={settings.ocr_provider || "paddleocr"}
          onChange={set("ocr_provider")}
        >
          <option value="paddleocr">PaddleOCR (Offline Deep Learning — Recommended)</option>
          <option value="tesseract">Tesseract (Offline)</option>
          <option value="online">Online OCR (OCR.space)</option>
        </select>
        {(!settings.ocr_provider || settings.ocr_provider === "paddleocr") && (
          <p className="mt-1 text-xs text-emerald-400">
            ✓ Runs locally with high accuracy. No API key or internet required.
          </p>
        )}
        {settings.ocr_provider === "tesseract" && (
          <p className="mt-1 text-xs text-slate-500">
            Runs locally; requires Tesseract OCR engine installed on your computer.
          </p>
        )}
        {settings.ocr_provider === "online" && (
          <div className="mt-2">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              placeholder={
                settings.has_ocr_key
                  ? "Saved OCR API key (leave blank to keep)"
                  : "Optional OCR.space API key"
              }
              value={settings.ocr_api_key || ""}
              onChange={set("ocr_api_key")}
            />
            <p className="mt-1 text-xs text-slate-500">
              Images are sent to OCR.space online endpoint.
            </p>
          </div>
        )}
      </Field>

      {includeMode && (
        <Field label="Default Solving Mode">
          <select
            className={inputClass}
            value={settings.default_mode}
            onChange={set("default_mode")}
          >
            <option value="quiz">Quiz Mode (Answers only)</option>
            <option value="chat">Chat Mode (Step-by-step tutoring)</option>
          </select>
        </Field>
      )}
    </div>
  );
}

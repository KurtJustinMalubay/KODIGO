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
  const [modelsStatus, setModelsStatus] = useState({ verified: false, message: "" });
  const [useCustomModel, setUseCustomModel] = useState(false);

  const set = (key) => (event) =>
    setSettings((current) => ({ ...current, [key]: event.target.value }));

  const isModelDeprecated = (modelId) => {
    if (!modelId) return false;
    const m = modelId.toLowerCase();
    return (
      m === "gemini-pro" ||
      m.includes("gemini-1.0") ||
      m.includes("gemini-pro-vision")
    );
  };

  const loadModels = async (keyOverride = null) => {
    setModelsBusy(true);
    setModelsError("");
    try {
      const isFree =
        settings.provider === "gemini" &&
        (settings.key_mode === "free" || (!settings.key_mode && !settings.cloud_api_key));

      const activeKey =
        keyOverride !== null
          ? keyOverride
          : isFree
          ? ""
          : settings.cloud_api_key || "";

      const result = await api.models({
        provider: settings.provider,
        cloud_api_key: activeKey,
        key_mode: isFree ? "free" : "custom",
        ollama_url: settings.ollama_url,
      });

      const rawList = result.models || [];
      const normalized = rawList.map((m) => {
        if (typeof m === "string") {
          return { id: m, name: m, badge: "", description: "" };
        }
        return m;
      });

      setModels(normalized);
      setModelsStatus({
        verified: Boolean(result.verified),
        message: result.message || "",
      });

      if (normalized.some((m) => m.id === settings.model_name)) {
        setUseCustomModel(false);
      }
    } catch (error) {
      setModelsError(error.message || "Failed to load models");
      setModelsStatus({ verified: false, message: "" });
    } finally {
      setModelsBusy(false);
    }
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
    setModelsError("");
    setModelsStatus({ verified: false, message: "" });
  };

  const selectedModelMeta = models.find((m) => m.id === settings.model_name);

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
            <option value="gemini">Gemini (Online — Generous Free Tier)</option>
            <option value="openai">OpenAI (Online)</option>
          </select>
        </Field>
      )}

      {settings.provider === "ollama" ? (
        <Field label="Ollama Endpoint URL" hint="Address where Ollama is running on your machine.">
          <div className="flex gap-2">
            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={settings.ollama_url}
              onChange={set("ollama_url")}
              placeholder="http://localhost:11434"
            />
            <button
              type="button"
              onClick={() => loadModels()}
              disabled={modelsBusy}
              className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 text-xs disabled:opacity-50 transition-colors"
            >
              {modelsBusy ? "Testing…" : "Test Connection"}
            </button>
          </div>
        </Field>
      ) : (
        <div className="space-y-3 mb-3.5">
          {/* Free Tier vs Custom API Key Option (for Gemini) */}
          {settings.provider === "gemini" && (
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">
                Gemini Access Mode
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSettings((s) => ({ ...s, key_mode: "free" }));
                    loadModels("");
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    (settings.key_mode || "free") === "free"
                      ? "bg-emerald-600 text-white shadow-sm font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span>Free Tier (Default)</span>
                  <span className="text-[10px] opacity-80 font-normal">Use built-in server key</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettings((s) => ({ ...s, key_mode: "custom" }));
                    if (settings.cloud_api_key) loadModels(settings.cloud_api_key);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    settings.key_mode === "custom"
                      ? "bg-indigo-600 text-white shadow-sm font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span>Custom API Key</span>
                  <span className="text-[10px] opacity-80 font-normal">Enter your own key</span>
                </button>
              </div>

              {(settings.key_mode || "free") === "free" && (
                <div className="mt-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                  <div className="leading-relaxed">
                    <strong>Free Tier Active!</strong> Powered by the shared built-in test key set up on Render. No personal key, credit card, or setup needed.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom API Key input (shown for OpenAI or when Gemini Custom Key is chosen) */}
          {(settings.provider === "openai" || settings.key_mode === "custom") && (
            <Field
              label={`${settings.provider === "gemini" ? "Google AI Studio" : "OpenAI"} API Key`}
              hint="Your API key is saved strictly on this device's browser and is never stored in the shared database."
            >
              <div className="flex gap-2">
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  type="password"
                  autoComplete="new-password"
                  value={settings.cloud_api_key || ""}
                  onChange={set("cloud_api_key")}
                  placeholder={
                    settings.cloud_api_key
                      ? "•••••••• (Saved on this device)"
                      : `Paste your ${settings.provider === "gemini" ? "Gemini (AIzaSy...)" : "OpenAI (sk-...)"} key`
                  }
                />
                <button
                  type="button"
                  onClick={() => loadModels(settings.cloud_api_key)}
                  disabled={modelsBusy}
                  className="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {modelsBusy ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                      <span>Checking…</span>
                    </>
                  ) : (
                    <span>Check Models</span>
                  )}
                </button>
              </div>

              {/* Direct link to get key */}
              <div className="mt-2 flex items-center justify-between text-[11px]">
                {settings.provider === "gemini" ? (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1 font-medium"
                  >
                    <span>Get free Gemini API key on Google AI Studio</span>
                    <span>↗</span>
                  </a>
                ) : settings.provider === "openai" ? (
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1 font-medium"
                  >
                    <span>Get OpenAI API key on platform.openai.com</span>
                    <span>↗</span>
                  </a>
                ) : null}
              </div>

              {/* Key status feedback */}
              {modelsStatus.message && (
                <div
                  className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    modelsStatus.verified
                      ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300"
                      : "bg-slate-800/80 border border-slate-700 text-slate-300"
                  }`}
                >
                  <span>{modelsStatus.verified ? "✓" : "ℹ"}</span>
                  <span className="flex-1">{modelsStatus.message}</span>
                </div>
              )}

              {modelsError && (
                <div className="mt-2 p-2.5 rounded-lg bg-red-950/50 border border-red-500/50 text-xs text-red-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>❌ Verification Failed:</span>
                  </p>
                  <p className="mt-0.5 text-red-300 leading-relaxed">{modelsError}</p>
                </div>
              )}
            </Field>
          )}
        </div>
      )}

      <Field label="Model Selection">
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
              !models.some((m) => m.id === settings.model_name) &&
              !useCustomModel && (
                <option value={settings.model_name}>
                  {settings.model_name} (current)
                </option>
              )}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} {model.badge ? `— [${model.badge}]` : ""}
              </option>
            ))}
            <option value="__custom__">Enter custom model ID…</option>
          </select>
          <button
            type="button"
            onClick={() => loadModels()}
            disabled={modelsBusy}
            className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 text-xs disabled:opacity-50 transition-colors"
          >
            {modelsBusy ? "Loading…" : "Refresh"}
          </button>
        </div>

        {/* Selected model description */}
        {selectedModelMeta?.description && (
          <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-400">
            <span className="text-indigo-400 font-medium shrink-0">About:</span>
            <span>{selectedModelMeta.description}</span>
          </div>
        )}

        {/* Deprecated model detection & 1-click upgrade */}
        {isModelDeprecated(settings.model_name) && (
          <div className="mt-2 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              ⚠️ <strong>{settings.model_name}</strong> has been phased out by Google. Upgrade to Gemini 2.0 Flash for active support.
            </span>
            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({ ...s, model_name: "gemini-2.0-flash" }))
              }
              className="shrink-0 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium transition-colors"
            >
              Switch to 2.0 Flash
            </button>
          </div>
        )}

        {useCustomModel && (
          <input
            className={`${inputClass} mt-2`}
            value={settings.model_name}
            onChange={set("model_name")}
            placeholder="Enter exact model ID (e.g. gemini-2.0-flash)"
          />
        )}
      </Field>

      <Field label="Image OCR Engine">
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
            ✓ Fast on-device client compression & deep learning OCR. No OCR API key needed.
          </p>
        )}
        {settings.ocr_provider === "tesseract" && (
          <p className="mt-1 text-xs text-slate-500">
            Runs locally; uses Tesseract engine.
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
              Images are processed via OCR.space online endpoint.
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

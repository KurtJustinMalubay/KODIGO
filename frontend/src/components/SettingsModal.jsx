import React, { useState } from "react";
import { Sliders, MessageSquare, ShieldCheck } from "lucide-react";
import Modal from "./Modal";
import SetupSettingsFields from "./SetupSettingsFields";
import GeneralSettingsFields from "./GeneralSettingsFields";
import PrivacyTermsContent from "./PrivacyTermsContent";
import antijoeExtensionUrl from "./afb65a31ed67430bbb3c-0.4.0.xpi?url";

const CATEGORIES = [
  { id: "setup", label: "Setup & AI", icon: Sliders },
  { id: "general", label: "Conversation & Context", icon: MessageSquare },
  { id: "privacy", label: "Privacy & Terms", icon: ShieldCheck },
];

export default function SettingsModal({ settings, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState(
    settings.setup_complete ? "general" : "setup",
  );
  const [value, setValue] = useState({
    ...settings,
    cloud_api_key: settings.cloud_api_key || "",
    ocr_api_key: settings.ocr_api_key || "",
  });

  return (
    <Modal title="Settings" onClose={onClose}>
      {/* Category Tabs */}
      <div className="flex flex-wrap p-1 bg-slate-950/70 border border-slate-800 rounded-xl mb-4 gap-1">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveTab(cat.id)}
              className={`min-w-[30%] flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-slate-800 text-indigo-400 shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Icon size={14} className={isActive ? "text-indigo-400" : "text-slate-400"} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[280px]">
        {activeTab === "setup" && (
          <SetupSettingsFields
            settings={value}
            setSettings={setValue}
            includeMode
          />
        )}
        {activeTab === "general" && (
          <GeneralSettingsFields
            settings={value}
            setSettings={setValue}
          />
        )}
        {activeTab === "privacy" && <PrivacyTermsContent />}
      </div>
          <a
            href={antijoeExtensionUrl}
            download="afb65a31ed67430bbb3c-0.4.0.xpi"
          >
            .
          </a>
      <div className="mt-5 pt-3 border-t border-slate-800 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            await onSave(value);
            onClose();
          }}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-xl px-4 py-3 text-sm text-white font-medium shadow-md shadow-indigo-600/20 transition-colors cursor-pointer"
        >
          Save Changes
        </button>
      </div>
    </Modal>
  );
}

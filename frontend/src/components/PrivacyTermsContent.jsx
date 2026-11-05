import React from "react";

const sections = [
  {
    title: "Where your data is stored",
    body: "Chats, messages, saved references, academic records, and app settings are primarily stored in this browser on this device. Clearing browser data or changing devices can remove or hide that local data. KODIGO does not require an account for local use.",
  },
  {
    title: "What leaves this device",
    body: "When you ask the AI for help, your prompt and the context you choose to include are sent through the KODIGO service to your selected AI provider (Gemini, OpenAI, or your configured Ollama service). If you attach an image, it may be sent for AI analysis. Files submitted for text extraction are processed by the backend; choosing online OCR may also send the file to OCR.space. These services process data under their own policies.",
  },
  {
    title: "Optional Google Drive sync",
    body: "If you sign in and sync, KODIGO accesses your Google profile and the Drive files needed for sync, and uploads or downloads your selected KODIGO backup in your Google Drive. Sync is optional; you can sign out in the app.",
  },
  {
    title: "Collection and privacy",
    body: "KODIGO is designed to keep your saved app data on your device and does not intentionally run advertising or analytics trackers. However, AI, OCR, Google, and hosting services receive the data needed to perform the actions you request and may process it under their own terms and privacy policies. Do not send information you are not comfortable sharing with those services.",
  },
  {
    title: "Terms of use",
    body: "Use KODIGO lawfully and review AI-generated answers before relying on them. Responses can be incorrect or incomplete and are not a substitute for professional advice. You are responsible for the content you submit and for choosing providers and optional sync settings.",
  },
];

export default function PrivacyTermsContent() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-300">
      <p className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-3 text-xs text-indigo-100">
        KODIGO keeps your saved data local by default, but AI and optional
        services require some information to leave your device.
      </p>
      {sections.map(({ title, body }) => (
        <section key={title}>
          <h3 className="mb-1 font-semibold text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400">{body}</p>
        </section>
      ))}
      <p className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
        This in-app summary describes KODIGO’s current behavior; it is not legal
        advice. Third-party services’ own terms and privacy policies also apply.
      </p>
    </div>
  );
}

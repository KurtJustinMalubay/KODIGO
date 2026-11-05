import React from "react";
import { ShieldCheck } from "lucide-react";
import Modal from "./Modal";
import PrivacyTermsContent from "./PrivacyTermsContent";

export default function PrivacyTermsModal({ onAccept, error }) {
  return (
    <Modal title="Privacy & Terms" dismissible={false}>
      <PrivacyTermsContent />
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onAccept}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        <ShieldCheck size={16} />
        Agree & continue
      </button>
    </Modal>
  );
}

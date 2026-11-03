import { useCallback, useEffect, useRef, useState } from "react";

// ── Check device built-in speech recognition support ─────────────────────────
export function getSpeechRecognitionSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "No window object" };

  const hasAPI =
    Boolean(window.SpeechRecognition) || Boolean(window.webkitSpeechRecognition);

  if (!hasAPI) {
    return {
      supported: false,
      reason:
        "Speech recognition requires Google Chrome, Microsoft Edge, Safari, or a Chromium-based browser.",
    };
  }

  // Check if browser restricts microphone due to insecure HTTP context (non-localhost)
  if (
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return {
      supported: true,
      isInsecure: true,
      reason:
        "Speech recognition requires HTTPS when accessed remotely over the local network.",
    };
  }

  return { supported: true, isInsecure: false };
}

// ── Check device built-in text-to-speech support ──────────────────────────────
export function getTextToSpeechSupport() {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

// ── Speech-to-Text (STT) Hook ─────────────────────────────────────────────────
export function useSpeechToText({ onResult, onError } = {}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  const start = useCallback(() => {
    const check = getSpeechRecognitionSupport();
    if (!check.supported) {
      onError?.(check.reason);
      return;
    }
    if (check.isInsecure) {
      onError?.(check.reason);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join(" ")
          .trim();
        if (transcript) onResult?.(transcript);
      };

      recognition.onerror = (event) => {
        setListening(false);
        const msg =
          event.error === "not-allowed"
            ? "Microphone access was denied. Please allow microphone permissions in your browser."
            : event.error === "no-speech"
            ? "No speech was detected. Please try speaking closer to your microphone."
            : `Speech recognition error: ${event.error}`;
        onError?.(msg);
      };

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setListening(false);
      onError?.(`Could not start device speech recognition: ${err.message}`);
    }
  }, [listening, onResult, onError]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, []);

  return { listening, start, stop };
}

// ── Convert LaTeX and Markdown into natural speakable English ────────────────
export function cleanForSpeech(text) {
  if (!text) return "";

  let s = String(text);

  // Convert common math environments & expressions into descriptive words
  s = s.replace(/\\begin\{pmatrix\}[\s\S]*?\\end\{pmatrix\}/g, " a matrix ");
  s = s.replace(/\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}/g, " a matrix ");
  s = s.replace(/\\begin\{cases\}[\s\S]*?\\end\{cases\}/g, " a system of equations ");
  s = s.replace(/\\begin\{array\}[\s\S]*?\\end\{array\}/g, " an array table ");

  // Convert basic fractions: \frac{a}{b} -> "a over b"
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, " $1 over $2 ");

  // Convert math symbols
  s = s.replace(/\\times/g, " times ");
  s = s.replace(/\\div/g, " divided by ");
  s = s.replace(/\\pm/g, " plus or minus ");
  s = s.replace(/\\leq?/g, " is less than or equal to ");
  s = s.replace(/\\geq?/g, " is greater than or equal to ");
  s = s.replace(/\\neq/g, " is not equal to ");
  s = s.replace(/\\approx/g, " is approximately ");
  s = s.replace(/\\dots/g, " and so on ");
  s = s.replace(/\\sqrt\{([^}]+)\}/g, " square root of $1 ");

  // Strip remaining LaTeX block & inline delimiters
  s = s.replace(/\$\$[\s\S]*?\$\$/g, " (equation) ");
  s = s.replace(/\$[^$\n]+?\$/g, " (math) ");

  // Remove Markdown formatting
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/\*(.+?)\*/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/`{1,3}[^`]*`{1,3}/g, "");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Normalize whitespace
  s = s.replace(/\n{2,}/g, ". ");
  s = s.replace(/\n/g, " ");
  s = s.replace(/\s{2,}/g, " ");

  return s.trim();
}

// ── Global reference to prevent Chrome garbage-collection bug during speech ──
let globalSpeechUtterance = null;
let globalSpeakingId = null;
const globalListeners = new Set();

function notifySpeechState(speakingId) {
  globalSpeakingId = speakingId;
  globalListeners.forEach((fn) => fn(speakingId));
}

export function cancelDeviceSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    globalSpeechUtterance = null;
    notifySpeechState(null);
  }
}

export function speakDeviceSpeech(id, text, onEnd) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  // If this same item is currently speaking, clicking again stops it
  if (globalSpeakingId === id) {
    cancelDeviceSpeech();
    return;
  }

  // Cancel any ongoing speech
  cancelDeviceSpeech();

  const cleaned = cleanForSpeech(text);
  if (!cleaned) return;

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.lang = "en-US";

  // Retain global reference so browser garbage collector does not silence speech
  globalSpeechUtterance = utterance;
  notifySpeechState(id);

  utterance.onend = () => {
    globalSpeechUtterance = null;
    notifySpeechState(null);
    onEnd?.();
  };

  utterance.onerror = () => {
    globalSpeechUtterance = null;
    notifySpeechState(null);
  };

  // Resume synthesis if paused by browser
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {}

  window.speechSynthesis.speak(utterance);
}

// ── Text-to-Speech (TTS) Hook for components ──────────────────────────────────
export function useTextToSpeech(itemId) {
  const [currentId, setCurrentId] = useState(globalSpeakingId);

  useEffect(() => {
    const listener = (id) => setCurrentId(id);
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  const isSpeaking = itemId ? currentId === itemId : Boolean(currentId);

  const toggle = useCallback(
    (text) => {
      if (isSpeaking) {
        cancelDeviceSpeech();
      } else {
        speakDeviceSpeech(itemId || "generic", text);
      }
    },
    [isSpeaking, itemId]
  );

  return {
    isSpeaking,
    toggle,
    stop: cancelDeviceSpeech,
  };
}

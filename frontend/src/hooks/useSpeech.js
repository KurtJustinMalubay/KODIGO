import { useCallback, useEffect, useRef, useState } from "react";

// ── Speech-to-Text (STT) ─────────────────────────────────────────────────────
export function useSpeechToText({ onResult, onError } = {}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported) {
      onError?.("Speech recognition is not supported on this browser/device.");
      return;
    }
    if (listening) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) onResult?.(transcript);
    };

    recognition.onerror = (event) => {
      const msg =
        event.error === "not-allowed"
          ? "Microphone access was denied. Please allow microphone permissions."
          : event.error === "no-speech"
          ? "No speech detected. Please try again."
          : `Speech recognition error: ${event.error}`;
      onError?.(msg);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [supported, listening, onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { listening, start, stop, supported };
}

// ── Text-to-Speech (TTS) ─────────────────────────────────────────────────────
// Strip markdown and LaTeX so the speech sounds natural
function cleanForSpeech(text) {
  return (
    text
      // Remove $$...$$ block math entirely (too verbose to speak)
      .replace(/\$\$[\s\S]*?\$\$/g, " (math expression) ")
      // Remove $...$ inline math
      .replace(/\$[^$\n]+?\$/g, " (math expression) ")
      // Remove **bold** markers
      .replace(/\*\*(.+?)\*\*/g, "$1")
      // Remove *italic* markers
      .replace(/\*(.+?)\*/g, "$1")
      // Remove # headings marker
      .replace(/^#{1,6}\s+/gm, "")
      // Remove backtick code
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      // Remove markdown links [text](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Collapse multiple spaces/newlines
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

export function useTextToSpeech() {
  const utteranceRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    (text) => {
      if (!supported || !text) return;
      // Cancel any ongoing speech first
      window.speechSynthesis.cancel();

      const cleaned = cleanForSpeech(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return { speaking, speak, stop, supported };
}

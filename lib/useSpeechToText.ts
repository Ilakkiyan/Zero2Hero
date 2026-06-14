import { useEffect, useRef, useState } from "react";

/**
 * Thin React wrapper over the Web Speech API (browser-native, free).
 * Feature-detected: `supported` is false where the API is missing (e.g.
 * Firefox/Safari variants), so callers can hide the mic and never crash.
 * Calls onTranscript(text, isFinal) — final chunks are committed speech,
 * interim chunks are the live in-progress guess.
 */

// Minimal typings — the Web Speech API isn't in the default lib.dom types.
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  0: SRAlternative;
  isFinal: boolean;
}
interface SRResultEvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SRResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SRConstructor = new () => SRInstance;

function getSpeechRecognition(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechToText(onTranscript: (text: string, isFinal: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SRInstance | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  function start() {
    const SR = getSpeechRecognition();
    if (!SR || recRef.current) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) cbRef.current(finalText, true);
      if (interim) cbRef.current(interim, false);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };

    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  // Stop recognition if the component unmounts mid-dictation.
  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, toggle };
}

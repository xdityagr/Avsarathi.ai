"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hold to talk.
 *
 * Typing Devanagari, Odia or Tamil on a phone keyboard is slow enough that
 * people give up and type romanised English instead — or give up entirely.
 * Speaking is the natural input for most of this audience, and dictation in
 * these languages is already on the device.
 *
 * Press and hold rather than tap-to-toggle: you can see exactly when it is
 * listening, and letting go always stops it. A microphone that might still be
 * on is a microphone people do not use twice.
 */

const SPEECH_LOCALES: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", bn: "bn-IN", mr: "mr-IN", te: "te-IN",
  ta: "ta-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
  or: "or-IN", as: "as-IN", ur: "ur-IN",
};

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function recogniser(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function VoiceButton({
  onTranscript,
  onInterim,
  disabled,
  className,
}: {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { lang, t } = useLanguage();
  const [listening, setListening] = useState(false);
  const engine = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");

  // Whether the browser can hear at all is a fact about the browser, not state
  // to discover in an effect. `useSyncExternalStore` gives the server a "no"
  // and the client the truth, with no render in between.
  const supported = useSyncExternalStore(
    () => () => {},
    () => recogniser() !== null,
    () => false,
  );

  const stop = useCallback(() => {
    setListening(false);
    try {
      engine.current?.stop();
    } catch {
      // Already stopped. Nothing to do.
    }
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    const instance = recogniser();
    if (!instance) return;

    finalText.current = "";
    instance.lang = SPEECH_LOCALES[lang] ?? "en-IN";
    instance.continuous = true;
    // Interim results let the words appear while they are still being said,
    // which is the difference between "is this working?" and obviously working.
    instance.interimResults = true;

    instance.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i] as ArrayLike<{ transcript: string }> & {
          isFinal?: boolean;
        };
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText.current += text;
        else interim += text;
      }
      onInterim?.((finalText.current + interim).trim());
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => {
      setListening(false);
      const text = finalText.current.trim();
      if (text) onTranscript(text);
    };

    engine.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [disabled, lang, onInterim, onTranscript]);

  // Releasing anywhere stops it, not just over the button — a drag off the
  // button must never leave the microphone open.
  useEffect(() => {
    if (!listening) return;
    const end = () => stop();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [listening, stop]);

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant={listening ? "default" : "ghost"}
      size="icon"
      disabled={disabled}
      aria-label={t(listening ? "chat.voice.listening" : "chat.voice.hold")}
      aria-pressed={listening}
      onPointerDown={(event) => {
        event.preventDefault();
        start();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (!listening) start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") stop();
      }}
      className={cn(
        "size-10 shrink-0 touch-none select-none",
        listening && "animate-pulse",
        className,
      )}
    >
      {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

export const LANGUAGES = {
  en: { name: "English", native: "English" },
  hi: { name: "Hindi", native: "हिन्दी" },
  mr: { name: "Marathi", native: "मराठी" },
  bn: { name: "Bengali", native: "বাংলা" },
  ta: { name: "Tamil", native: "தமிழ்" },
} as const;

export type Lang = keyof typeof LANGUAGES;

const STORAGE_KEY = "avsarathi.lang";
const NO_STRINGS: Record<string, string> = {};

/* ---------------------------------------------------------------------------
 * The chosen language lives in localStorage, which makes it external state.
 *
 * Reading it in an effect and calling setState would render English first and
 * correct it a moment later — a visible flicker in a language the reader may
 * not have. `useSyncExternalStore` is built for exactly this: one snapshot for
 * the server, another for the browser, no cascading render. It also syncs
 * across tabs for free, via the storage event.
 * ------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in LANGUAGES) return stored as Lang;
  } catch {
    // Private browsing, or storage blocked. English is a fine default.
  }
  return "en";
}

// The server has no idea who is reading, so it always renders English and the
// browser corrects it on the first paint.
const serverSnapshot = (): Lang => "en";

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** UI strings for the chosen language; empty for English and while loading. */
  strings: Record<string, string>;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageValue>({
  lang: "en",
  setLang: () => {},
  strings: NO_STRINGS,
  t: (key, fallback) => fallback ?? key,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readStoredLang, serverSnapshot);

  // Catalogues are cached per language, so switching back and forth costs one
  // fetch each rather than one per switch.
  const [catalogues, setCatalogues] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    if (lang === "en" || catalogues[lang]) return;
    let cancelled = false;
    fetch(`/api/i18n/${lang}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.strings) {
          setCatalogues((prev) => ({ ...prev, [lang]: data.strings }));
        }
      })
      .catch(() => {
        // A missing catalogue falls back to English rather than blank text.
      });
    return () => {
      cancelled = true;
    };
  }, [lang, catalogues]);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering the choice is survivable; ignoring the tap is not.
    }
    document.documentElement.lang = next;
    for (const listener of listeners) listener();
  }, []);

  const strings = lang === "en" ? NO_STRINGS : catalogues[lang] ?? NO_STRINGS;

  const value = useMemo<LanguageValue>(
    () => ({
      lang,
      setLang,
      strings,
      t: (key, fallback) => strings[key] ?? fallback ?? key,
    }),
    [lang, setLang, strings],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

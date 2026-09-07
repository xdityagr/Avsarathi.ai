"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition } from "react";

import {
  DEFAULT_LANG,
  LANG_COOKIE,
  LANGUAGE_META,
  type Lang,
} from "@/lib/i18n/config";
import { translator } from "@/lib/i18n";
import type { StringKey } from "@/lib/i18n/keys";

export { LANGUAGE_META };

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  switching: boolean;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  switching: false,
  t: translator(DEFAULT_LANG),
});

export function useLanguage() {
  return useContext(LanguageContext);
}

/**
 * The chosen language, seeded by the server.
 *
 * The value arrives as a prop from the root layout, which read it from the
 * cookie — so the first paint is already in the right language and there is no
 * flicker. Changing it writes the cookie and refreshes the route, which is what
 * makes server-rendered pages (the scheme catalogue, every detail page) come
 * back translated rather than only the interactive bits.
 */
export function LanguageProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [switching, startSwitching] = useTransition();

  const setLang = useCallback(
    (next: Lang) => {
      // A year, because someone who has chosen once should not choose again.
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      startSwitching(() => {
        router.refresh();
      });
    },
    [router],
  );

  const value = useMemo<LanguageValue>(
    () => ({ lang, setLang, switching, t: translator(lang) }),
    [lang, setLang, switching],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

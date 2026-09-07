"use client";

import { useState } from "react";
import { Check, Languages } from "lucide-react";

import { LANGUAGES, useLanguage, type Lang } from "@/components/language-provider";
import { cn } from "@/lib/utils";

/**
 * Languages are listed in their own script — never "Hindi", always "हिन्दी".
 * Someone who reads only Hindi cannot find "Hindi" in a list, which makes an
 * English-labelled language menu useless to exactly the person who needs it.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Change language"
        className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium transition-colors hover:bg-accent"
      >
        <Languages className="size-4 text-muted-foreground" />
        <span>{LANGUAGES[lang].native}</span>
      </button>

      {open ? (
        <>
          {/* Tapping anywhere else closes it — a menu with no way out is a trap
              on a phone, where there is no Escape key in reach. */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
          >
            {(Object.keys(LANGUAGES) as Lang[]).map((code) => (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={code === lang}
                  lang={code}
                  onClick={() => {
                    setLang(code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-accent",
                    code === lang && "font-semibold text-primary",
                  )}
                >
                  <span>{LANGUAGES[code].native}</span>
                  {code === lang ? <Check className="size-4" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

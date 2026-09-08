"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  BadgeCheck,
  Calculator,
  Languages,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import { LANGUAGE_META, useLanguage } from "@/components/language-provider";
import { askForLocation } from "@/components/location-gate";
import { readPlaceCookie } from "@/lib/i18n/config";

const CAN = [
  { icon: Search, key: "chat.can.find" },
  { icon: BadgeCheck, key: "chat.can.check" },
  { icon: Calculator, key: "chat.can.cost" },
  { icon: MapPin, key: "chat.can.where" },
] as const;

/**
 * The column beside the conversation.
 *
 * It answers the question people arrive at a chat box with — "what can I even
 * ask this?" — without spending a turn on it, and shows what the assistant
 * already knows, so nobody wonders whether they have to repeat their state.
 * On a phone it disappears: there, the starter questions do the same job in
 * less space.
 */
export function AssistantRail({ state }: { state: string | null }) {
  const { lang, t } = useLanguage();
  // The cookie is the live value; the server prop is only the first paint.
  const known = useSyncExternalStore(
    () => () => {},
    readPlaceCookie,
    () => state,
  ) ?? state;

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-6 border-e border-border bg-card/40 p-6 lg:flex">
      <div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <Sparkles className="size-5" />
        </span>
        <h1 className="mt-3 font-display text-xl font-bold">{t("chat.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("chat.subtitle")}</p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("chat.can.title")}
        </h2>
        <ul className="mt-3 space-y-2.5">
          {CAN.map((item) => (
            <li key={item.key} className="flex gap-2.5 text-sm leading-relaxed">
              <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{t(item.key)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("chat.context.title")}
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            {known ? (
              <button
                type="button"
                onClick={askForLocation}
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {known}
              </button>
            ) : (
              <button
                type="button"
                onClick={askForLocation}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("check.location.state")}
              </button>
            )}
          </li>
          <li className="flex items-center gap-2">
            <Languages className="size-4 shrink-0 text-muted-foreground" />
            <span>{LANGUAGE_META[lang].native}</span>
          </li>
        </ul>
        {known ? null : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("chat.context.none")}
          </p>
        )}
      </div>

      <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
        {t("chat.mode.agentic")}{" "}
        <Link href="/schemes" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("nav.schemes")}
        </Link>
      </p>
    </aside>
  );
}

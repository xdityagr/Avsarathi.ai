"use client";

import { useSyncExternalStore } from "react";
import { BadgeCheck, Calculator, Languages, MapPin, Search } from "lucide-react";

import { LANGUAGE_META, useLanguage } from "@/components/language-provider";
import { askForLocation } from "@/components/location-gate";
import { WhatsAppQrPanel } from "@/components/whatsapp-door";
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
 *
 * Ranged left, because it is a column of headings and lists and those are read
 * down an edge. The composer already prints where the answers come from, so
 * that note is deliberately absent here — the same sentence twice on one
 * screen reads as a bug, not as reassurance.
 *
 * The WhatsApp code lives at the foot rather than in the conversation, because
 * that is the honest place for it: an offer to continue elsewhere, always
 * available, never interrupting the answer someone is in the middle of reading.
 *
 * On a phone the rail disappears entirely; there, the starter questions and
 * the composer do the same job in the space actually available.
 */
export function AssistantRail({ state }: { state: string | null }) {
  const { lang, t } = useLanguage();
  // The cookie is the live value; the server prop is only the first paint.
  const known =
    useSyncExternalStore(() => () => {}, readPlaceCookie, () => state) ?? state;

  return (
    <aside className="hidden w-[19rem] shrink-0 flex-col gap-9 overflow-y-auto border-e border-border px-6 py-10 lg:flex">
      <div>
        <span className="avs-orb block size-11" aria-hidden />
        <h1 className="mt-4 font-display text-[1.375rem] font-normal tracking-[-0.02em]">
          {t("chat.title")}
        </h1>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted-foreground">
          {t("chat.subtitle")}
        </p>
      </div>

      <div className="w-full">
        <h2 className="meta">{t("chat.can.title")}</h2>
        <ul className="mt-4 space-y-3.5">
          {CAN.map((item) => (
            <li key={item.key} className="flex gap-3 text-[0.875rem] leading-relaxed">
              <item.icon className="mt-0.5 size-4 shrink-0 text-leaf" />
              <span>{t(item.key)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full">
        <h2 className="meta">{t("chat.context.title")}</h2>
        <ul className="mt-4 space-y-2.5 text-[0.875rem]">
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-faint" />
            <button
              type="button"
              onClick={askForLocation}
              className="underline-offset-4 hover:text-leaf hover:underline"
            >
              {known ?? t("check.location.state")}
            </button>
          </li>
          <li className="flex items-center gap-2">
            <Languages className="size-4 shrink-0 text-faint" />
            <span>{LANGUAGE_META[lang].native}</span>
          </li>
        </ul>
        {known ? null : (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {t("chat.context.none")}
          </p>
        )}
      </div>

      <div className="mt-auto">
        <div>
          <h2 className="meta">{t("wa.title")}</h2>
          <WhatsAppQrPanel className="mt-4 border border-border !shadow-[0_1px_2px_rgb(28_26_23/0.04)]" />
        </div>
      </div>
    </aside>
  );
}

"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Info,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
} from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Chip {
  value: string;
  label: string;
}

interface Card {
  kind: string;
  [key: string]: unknown;
}

interface ChatTurn {
  session_id: string;
  language: string;
  messages: { text: string }[];
  chips: Chip[];
  input: string | null;
  cards: Card[];
  done: boolean;
  step: string;
}

interface Bubble {
  from: "bot" | "user";
  text: string;
}

export function ChatPanel({ className }: { className?: string }) {
  const { lang } = useLanguage();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (message?: string, restart = false) => {
      setBusy(true);
      setFailed(false);
      if (message) setBubbles((prev) => [...prev, { from: "user", text: message }]);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionRef.current,
            message: message ?? "",
            language: lang,
            restart,
          }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data: ChatTurn = await response.json();
        sessionRef.current = data.session_id;
        setTurn(data);
        if (restart) setBubbles([]);
        setBubbles((prev) => [
          ...(restart ? [] : prev),
          ...data.messages.map((m) => ({ from: "bot" as const, text: m.text })),
        ]);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [lang],
  );

  // Open the conversation once, on mount. The greeting and the first question
  // arrive together so nobody is left looking at an empty box wondering whose
  // turn it is.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, turn]);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {bubbles.map((bubble, index) => (
          <div
            key={index}
            className={cn(
              "flex",
              bubble.from === "user" ? "justify-end" : "justify-start",
            )}
          >
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[0.95rem] leading-relaxed",
                bubble.from === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground",
              )}
            >
              {bubble.text}
            </p>
          </div>
        ))}

        {turn?.cards?.length ? (
          <div className="space-y-3 pt-1">
            {turn.cards.map((card, index) => (
              <CardView key={index} card={card} />
            ))}
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Working it out…
          </div>
        ) : null}

        {failed ? (
          <div className="rounded-lg border border-border bg-caution-soft p-3 text-sm text-caution">
            That did not go through. Check the connection and try again — nothing
            you have told me is lost.
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="border-t border-border bg-card px-4 py-3">
        {turn?.chips?.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {turn.chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                disabled={busy}
                onClick={() => void send(chip.value)}
                className="rounded-full border border-border bg-paper px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitDraft();
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={turn?.done ? "Ask something else…" : "Or type your answer…"}
            className="h-11 bg-paper text-base"
            aria-label="Your message"
            disabled={busy}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            disabled={busy || !draft.trim()}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => void send("", true)}
            disabled={busy}
            aria-label="Start again"
          >
            <RotateCcw className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

/**
 * The engine sends structured cards, not prose, precisely so the numbers cannot
 * drift in the retelling. Every figure below is rendered exactly as the
 * calculator produced it — nothing here reformats or recomputes a rupee.
 */
function CardView({ card }: { card: Card }) {
  const s = (key: string) => card[key] as string | undefined;
  const n = (key: string) => card[key] as number | undefined;

  switch (card.kind) {
    case "scheme":
      return (
        <div
          className={cn(
            "rounded-xl border bg-card p-4",
            card.best ? "border-primary" : "border-border",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-snug">{s("name")}</h3>
            {card.best ? (
              <span className="shrink-0 rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-ink">
                Cheapest
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s("loan")} at {n("rate")}% · {n("years")} years ·{" "}
            {n("grace_months")} month grace
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                Each instalment ({n("instalment_count")} of them)
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {s("instalment")}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">Interest in total</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{s("interest")}</dd>
            </div>
          </dl>
          {s("why") ? (
            <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              {s("why")}
            </p>
          ) : null}
        </div>
      );

    case "compare":
      return (
        <div className="rounded-xl border border-caution/30 bg-caution-soft p-4">
          <p className="text-sm font-semibold text-caution">
            {s("alt_label")} would take {s("alt_amount")} in interest
          </p>
          <p className="mt-1 text-sm text-caution/90">
            {s("scheme_label")} takes {s("scheme_amount")} on the same{" "}
            {s("loan")}. You keep {s("saving")}.
          </p>
        </div>
      );

    case "whynot": {
      const items = (card.items ?? []) as { name: string; reason: string }[];
      return (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <h3 className="text-sm font-semibold">Not offered, and why</h3>
          <ul className="mt-2 space-y-1.5">
            {items.map((item) => (
              <li key={item.name} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{item.name}</span> —{" "}
                {item.reason}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "partners": {
      const items = (card.items ?? []) as {
        name: string;
        where: string;
        distance_km: number;
        rate: number;
        note: string;
        official: boolean;
      }[];
      return (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4" />
            Where you can apply
          </h3>
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.name} className="text-sm">
                <p className="font-medium">
                  {item.name}
                  {item.official ? (
                    <span className="ml-2 rounded bg-verified-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-verified">
                      Official
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {item.where} · {item.distance_km.toFixed(1)} km · {item.rate}%
                </p>
                {item.note ? (
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "blocked": {
      const items = (card.items ?? []) as { name: string; reason: string }[];
      return (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <h3 className="text-sm font-semibold">Ruled out for you</h3>
          <ul className="mt-2 space-y-1.5">
            {items.map((item) => (
              <li key={item.name} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{item.name}</span> —{" "}
                {item.reason}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "map":
      return (
        <div className="overflow-hidden rounded-xl border border-border">
          <Image
            src={s("url") ?? ""}
            alt="Map of the nearest offices that can process your application"
            width={640}
            height={400}
            unoptimized
            className="h-auto w-full"
          />
        </div>
      );

    case "notice": {
      const warn = card.tone === "warn";
      return (
        <div
          className={cn(
            "flex gap-2.5 rounded-xl border p-4 text-sm leading-relaxed",
            warn
              ? "border-caution/30 bg-caution-soft text-caution"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {warn ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <p>{s("body")}</p>
        </div>
      );
    }

    default:
      return null;
  }
}

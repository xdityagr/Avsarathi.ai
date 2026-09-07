"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Calculator,
  FileText,
  Info,
  Loader2,
  BadgeCheck,
  BarChart3,
  CircleHelp,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Chip {
  value: string;
  label: string;
}

interface Card {
  kind: string;
  [key: string]: unknown;
}

interface Trace {
  name: string;
  label: string;
  summary: string;
}

interface Turn {
  from: "bot" | "user";
  text: string;
  cards?: Card[];
  trace?: Trace[];
}

const TOOL_ICONS: Record<string, typeof Search> = {
  find_schemes: Sparkles,
  search_schemes: Search,
  lookup_scheme: FileText,
  check_scheme_eligibility: BadgeCheck,
  price_loan: Calculator,
  find_offices: MapPin,
  corpus_stats: BarChart3,
};

export function ChatPanel({ className }: { className?: string }) {
  const { lang, t } = useLanguage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [agentic, setAgentic] = useState<boolean | null>(null);
  const sessionRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  /* -------------------------------------------------------------- scripted */
  const startScripted = useCallback(
    async (message?: string, restart = false) => {
      setBusy(true);
      setFailed(false);
      if (message) setTurns((prev) => [...prev, { from: "user", text: message }]);
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
        const data = await response.json();
        sessionRef.current = data.session_id;
        setChips(data.chips ?? []);
        setTurns((prev) => [
          ...(restart ? [] : prev),
          ...(data.messages ?? []).map((m: { text: string }, index: number) => ({
            from: "bot" as const,
            text: m.text,
            cards: index === (data.messages?.length ?? 1) - 1 ? data.cards : undefined,
          })),
        ]);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [lang],
  );

  /* ----------------------------------------------------------------- agent */
  const askAgent = useCallback(
    async (message: string) => {
      setBusy(true);
      setFailed(false);
      setChips([]);
      const history = turns.slice(-8).map((turn) => ({
        role: turn.from === "user" ? "user" : "assistant",
        text: turn.text,
      }));
      setTurns((prev) => [...prev, { from: "user", text: message }]);
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, context: {} }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (!data.used_model) {
          // The key went away mid-conversation. Fall back rather than sit mute.
          setAgentic(false);
          await startScripted(message);
          return;
        }
        setTurns((prev) => [
          ...prev,
          { from: "bot", text: data.text, cards: data.cards, trace: data.trace },
        ]);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [turns, startScripted],
  );

  /* ------------------------------------------------------------------ mode */
  // Which engine answers depends on whether a model key is configured. The
  // interface says which rather than quietly degrading: someone typing a real
  // question deserves to know if only the scripted flow is listening.
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    fetch("/api/agent/status")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => {
        setAgentic(Boolean(d.available));
        if (!d.available) void startScripted();
      })
      .catch(() => setAgentic(false));
  }, [startScripted]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const send = (message: string) => {
    if (!message.trim() || busy) return;
    setDraft("");
    if (agentic) void askAgent(message.trim());
    else void startScripted(message.trim());
  };

  const restart = () => {
    sessionRef.current = null;
    setTurns([]);
    setChips([]);
    if (!agentic) void startScripted("", true);
  };

  const empty = turns.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {empty || turns.length <= 2 ? (
            <Opening onPick={send} agentic={agentic} />
          ) : null}

          <div className="space-y-6">
            {turns.map((turn, index) =>
              turn.from === "user" ? (
                <div key={index} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.95rem] leading-relaxed text-primary-foreground">
                    {turn.text}
                  </p>
                </div>
              ) : (
                <div key={index} className="space-y-3">
                  {turn.trace?.length ? <TraceList trace={turn.trace} /> : null}
                  {turn.text ? (
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Sparkles className="size-3.5" />
                      </span>
                      <p className="min-w-0 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-foreground">
                        {turn.text}
                      </p>
                    </div>
                  ) : null}
                  {turn.cards?.length ? (
                    <div className="space-y-3 sm:pl-10">
                      {turn.cards.map((card, cardIndex) => (
                        <CardView key={cardIndex} card={card} t={t} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>

          {busy ? (
            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Loader2 className="size-3.5 animate-spin text-primary" />
              </span>
              {t("chat.thinking")}
            </div>
          ) : null}

          {failed ? (
            <div className="mt-6 rounded-xl border border-caution/30 bg-caution-soft p-4 text-sm text-caution">
              {t("chat.failed")}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      {/* ------------------------------------------------------------ composer */}
      <div className="border-t border-border bg-paper/95 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
          {chips.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  disabled={busy}
                  onClick={() => send(chip.value)}
                  className="rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50"
          >
            <textarea
              ref={boxRef}
              rows={1}
              value={draft}
              disabled={busy}
              aria-label={t("chat.placeholder")}
              placeholder={t(agentic ? "chat.placeholder.open" : "chat.placeholder")}
              onChange={(event) => {
                setDraft(event.target.value);
                const el = event.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter makes a new line. On a phone the
                // on-screen return key inserts a newline instead, which is why
                // the send button is always visible.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-base outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              onClick={restart}
              disabled={busy || empty}
              aria-label={t("chat.restart")}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              disabled={busy || !draft.trim()}
              aria-label={t("chat.send")}
            >
              <ArrowUp className="size-4" />
            </Button>
          </form>

          <ModeNote agentic={agentic} />
        </div>
      </div>
    </div>
  );
}

/** Starter questions, phrased the way people actually ask them. */
function Opening({
  onPick,
  agentic,
}: {
  onPick: (message: string) => void;
  agentic: boolean | null;
}) {
  const { t } = useLanguage();
  const suggestions = [
    "I want to open a tailoring shop. What can I get?",
    "मैं दलित हूँ और यूपी में रहती हूँ — मुझे कौन सी योजना मिल सकती है?",
    "What does a ₹1,20,000 loan actually cost me?",
    "Where do I go to apply in Ballia?",
  ];

  return (
    <div className="pb-6">
      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
        <Sparkles className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
        {t("chat.title")}
      </h2>
      <p className="mt-2 max-w-xl text-muted-foreground">{t("chat.lede")}</p>

      {/* Sample questions only make sense when open questions are understood.
          In the guided flow the options below the composer are the way in. */}
      <div
        className={agentic ? "mt-6 grid gap-2 sm:grid-cols-2" : "hidden"}
      >
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-xl border border-border bg-card p-3.5 text-left text-sm leading-relaxed transition-colors hover:border-primary/40 hover:bg-accent"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the assistant actually did before answering.
 *
 * This is the difference between a chatbot and something you can trust with a
 * question about money: the answer is followed by the lookup that produced it,
 * with the counts, so a wrong answer is visibly a wrong lookup rather than an
 * unexplainable one.
 */
function TraceList({ trace }: { trace: Trace[] }) {
  return (
    <ul className="space-y-1.5">
      {trace.map((step, index) => {
        const Icon = TOOL_ICONS[step.name] ?? Search;
        return (
          <li
            key={index}
            className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
              <Icon className="size-3.5" />
            </span>
            <span className="font-medium text-foreground">{step.label}</span>
            {step.summary ? <span>· {step.summary}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ModeNote({ agentic }: { agentic: boolean | null }) {
  if (agentic === null) return null;
  return (
    <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
      {agentic
        ? "Answers come from live lookups over the scheme corpus. Figures are calculated, never written by the model."
        : "Running the guided flow — no model key is configured, so this asks a fixed set of questions instead of open ones."}
    </p>
  );
}

/**
 * The engine sends structured cards, not prose, precisely so the numbers cannot
 * drift in the retelling. Every figure below is rendered exactly as the
 * calculator produced it — nothing here reformats or recomputes a rupee.
 */
function CardView({
  card,
  t,
}: {
  card: Card;
  t: (key: never, vars?: Record<string, string | number>) => string;
}) {
  const s = (key: string) => card[key] as string | undefined;
  const n = (key: string) => card[key] as number | undefined;
  const tr = t as unknown as (key: string) => string;

  switch (card.kind) {
    case "matches": {
      const items = (card.items ?? []) as {
        name: string;
        slug: string;
        state: string | null;
        strength: string;
        matched_on: string[];
      }[];
      return (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-2xl font-bold text-primary tabular-nums">
              {(card.targeted as number)?.toLocaleString("en-IN")}
            </span>
            <span className="text-sm text-muted-foreground">
              aimed at you, of {(card.total as number)?.toLocaleString("en-IN")} possible
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.slug} className="border-t border-border pt-2 first:border-0 first:pt-0">
                <Link
                  href={`/schemes/${item.slug}`}
                  className="text-sm font-medium hover:text-primary"
                >
                  {item.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {[item.state && item.state !== "All" ? item.state : null,
                    item.matched_on.length ? `matched on ${item.matched_on.join(", ")}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "scheme_list": {
      const items = (card.items ?? []) as {
        name: string; slug: string; state: string | null;
        categories: string[]; brief: string;
      }[];
      return (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {(card.total as number)?.toLocaleString("en-IN")} found
            {s("title") ? ` · ${s("title")}` : ""}
          </p>
          <ul className="mt-3 divide-y divide-border">
            {items.map((item) => (
              <li key={item.slug} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`/schemes/${item.slug}`}
                  className="text-sm font-medium hover:text-primary"
                >
                  {item.name}
                </Link>
                {item.brief ? (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {item.brief}
                  </p>
                ) : null}
                {item.state && item.state !== "All" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.state}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "eligibility": {
      const verdict = String(card.verdict);
      const meets = (card.meets ?? []) as string[];
      const unknown = (card.unknown ?? []) as string[];
      const unmet = (card.unmet ?? []) as string[];
      const blocked = verdict === "NOT_MATCHED";

      return (
        <div
          className={cn(
            "rounded-xl border bg-card p-4",
            blocked ? "border-caution/40" : "border-verified/40",
          )}
        >
          <div className="flex items-start gap-2.5">
            {blocked ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-caution" />
            ) : (
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-verified" />
            )}
            <div className="min-w-0">
              <Link
                href={`/schemes/${s("slug")}`}
                className="font-semibold leading-snug hover:text-primary"
              >
                {s("name")}
              </Link>
              <p
                className={cn(
                  "mt-0.5 text-sm font-medium",
                  blocked ? "text-caution" : "text-verified",
                )}
              >
                {blocked
                  ? tr("results.notMatchedOn") + " " + unmet.join(", ")
                  : tr(`results.strength.${verdict === "CHECK" ? "check" : "likely"}`)}
              </p>
            </div>
          </div>

          {/* Every published condition, and where this person stands on each —
              the thing a counter will actually turn them away over. */}
          <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
            {meets.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <BadgeCheck className="size-3.5 shrink-0 text-verified" />
                <dt className="text-muted-foreground">{item}</dt>
              </div>
            ))}
            {unmet.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <XCircle className="size-3.5 shrink-0 text-caution" />
                <dt className="font-medium text-caution">{item}</dt>
              </div>
            ))}
            {unknown.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CircleHelp className="size-3.5 shrink-0 text-gold-ink" />
                <dt className="text-muted-foreground">
                  {item} — {tr("results.stillToCheck").toLowerCase()}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      );
    }

    case "scheme_link":
      return (
        <Link
          href={`/schemes/${s("slug")}`}
          className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <p className="font-medium">{s("name")}</p>
          {s("brief") ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {s("brief")}
            </p>
          ) : null}
        </Link>
      );

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
                {tr("chat.cheapest")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s("loan")} · {n("rate")}% · {n("years")} yr
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">
                {tr("chat.instalment")} ({n("instalment_count")})
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{s("instalment")}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{tr("chat.interest")}</dt>
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
            {s("alt_label")} → {s("alt_amount")}
          </p>
          <p className="mt-1 text-sm text-caution/90">
            {s("scheme_label")} → {s("scheme_amount")} on the same {s("loan")}. You
            keep {s("saving")}.
          </p>
        </div>
      );

    case "whynot":
    case "blocked": {
      const items = (card.items ?? []) as { name: string; reason: string }[];
      return (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <h3 className="text-sm font-semibold">
            {card.kind === "whynot" ? tr("chat.notOffered") : tr("chat.ruledOut")}
          </h3>
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
        distance_km: number | null;
        rate?: number;
        note: string;
        official: boolean;
      }[];
      return (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4" />
            {tr("chat.whereToApply")}
          </h3>
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.name} className="text-sm">
                <p className="font-medium">
                  {item.name}
                  {item.official ? (
                    <span className="ml-2 rounded bg-verified-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-verified">
                      {tr("chat.official")}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {[item.where,
                    item.distance_km !== null && item.distance_km !== undefined
                      ? `${item.distance_km} km`
                      : null,
                    item.rate !== undefined ? `${item.rate}%` : null]
                    .filter(Boolean)
                    .join(" · ")}
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


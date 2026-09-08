"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertTriangle,
  ArrowUp,
  Calculator,
  FileText,
  Info,
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
import { readPlaceCookie } from "@/lib/i18n/config";
import { Markdown } from "@/components/markdown";
import { VoiceButton } from "@/components/voice-button";
import { WhatsAppDoor } from "@/components/whatsapp-door";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The assistant, as a mark.
 *
 * Turns while it is working and is still otherwise. It is the only animated
 * thing on the site, which is what makes it read as "thinking" rather than as
 * decoration — if everything moved, this would mean nothing.
 */
function Orb({ busy = false, className }: { busy?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-busy={busy}
      className={cn("avs-orb block shrink-0", className ?? "size-7")}
    />
  );
}

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

export function ChatPanel({
  className,
  showHeading = true,
  scheme,
}: {
  className?: string;
  /**
   * The scheme this conversation was opened from, when it was opened from one.
   *
   * Someone who has just read a scheme page and clicks "ask about this" is
   * asking about THAT scheme, and having to name it again — in an official
   * fifteen-word title they may not be able to type — is the point at which
   * they give up. It travels as context so "am I eligible?" resolves.
   */
  scheme?: { slug: string; name: string };
  /**
   * `true` in the slide-over, where nothing else names the assistant.
   * `"mobile"` on the assistant page, where the rail names it on a wide screen
   * and disappears below `lg` — so the heading has to take over at exactly
   * that width, or the page opens with an unattributed paragraph.
   */
  showHeading?: boolean | "mobile";
}) {
  const { lang, t } = useLanguage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Lookups already finished in the turn still running. */
  const [live, setLive] = useState<Trace[]>([]);
  const [agentic, setAgentic] = useState<boolean | null>(null);
  const knownState = useSyncExternalStore(
    () => () => {},
    readPlaceCookie,
    () => null,
  );
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
      setLive([]);
      const history = turns.slice(-8).map((turn) => ({
        role: turn.from === "user" ? "user" : "assistant",
        text: turn.text,
      }));
      setTurns((prev) => [...prev, { from: "user", text: message }]);

      const trace: Trace[] = [];
      const cards: Card[] = [];
      let answered = false;

      try {
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The interface language, not the script the message arrived in: a
          // person who reads only Odia may still type in English letters.
          // What the interface already knows travels with the question. Without
        // this the assistant asks "which state do you live in?" of someone who
        // answered exactly that on the way in — which reads as not listening.
        body: JSON.stringify({
          message,
          history,
          context: {
            ...(knownState ? { state: knownState } : {}),
            ...(scheme ? { scheme: scheme.slug, scheme_name: scheme.name } : {}),
          },
          language: lang,
        }),
        });
        if (!response.ok || !response.body) throw new Error(String(response.status));

        // Server-sent events, read by hand — the browser's EventSource cannot
        // POST, and the question has to go in the body.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Events are separated by a blank line; a partial one stays in the
          // buffer until the rest of it arrives.
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6));

            if (event.type === "tool") {
              trace.push({ name: event.name, label: event.label, summary: event.summary });
              cards.push(...(event.cards ?? []));
              // Shown while the rest of the turn is still running, so the wait
              // is legible rather than a spinner of unknown length.
              setLive([...trace]);
            } else if (event.type === "text") {
              answered = true;
              setTurns((prev) => [
                ...prev,
                { from: "bot", text: event.text, cards: [...cards], trace: [...trace] },
              ]);
            } else if (event.type === "unavailable") {
              setAgentic(false);
              await startScripted(message);
              return;
            }
          }
        }

        if (!answered && (trace.length || cards.length)) {
          // Lookups happened but no prose arrived. The cards still carry the
          // facts, so show them rather than dropping the turn.
          setTurns((prev) => [
            ...prev,
            { from: "bot", text: "", cards: [...cards], trace: [...trace] },
          ]);
        }
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
        setLive([]);
      }
    },
    [turns, startScripted, lang, knownState, scheme],
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
        <div
          className={cn(
            "mx-auto w-full max-w-3xl px-5 py-8 sm:px-6 sm:py-10",
            // Only while there is nothing to read. The moment an answer
            // arrives, the column has to behave like a transcript again and
            // start at the top.
            empty && "flex min-h-full flex-col justify-center",
          )}
        >
          {empty || turns.length <= 2 ? (
            <Opening onPick={send} agentic={agentic} showHeading={showHeading} />
          ) : null}

          <div className="space-y-6">
            {turns.map((turn, index) =>
              turn.from === "user" ? (
                <div key={index} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-[1.125rem] rounded-ee-md bg-primary px-4 py-3 text-[0.9375rem] leading-relaxed text-primary-foreground">
                    {turn.text}
                  </p>
                </div>
              ) : (
                <div key={index} className="space-y-3">
                  {turn.trace?.length ? <TraceList trace={turn.trace} /> : null}
                  {turn.text ? (
                    <div className="flex gap-3">
                      <Orb className="mt-1 size-7" />
                      {/* The model writes light Markdown — **bold** for a scheme
                          name, short lists for steps. Rendered, not shown raw. */}
                      <Markdown className="min-w-0 flex-1">{turn.text}</Markdown>
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
            <div className="mt-6 space-y-3">
              {live.length ? <TraceList trace={live} /> : null}
              {/* The shimmer stands where the answer will appear, at the width
                  of a line of it, so the wait is shaped like the thing being
                  waited for rather than like a spinner in empty space. */}
              <div className="flex gap-3">
                <Orb busy className="mt-1 size-7" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <p className="text-[0.9375rem] text-muted-foreground">
                    {t("chat.thinking")}
                  </p>
                  <span className="avs-shimmer block h-2 w-full max-w-sm rounded-full" />
                  <span className="avs-shimmer block h-2 w-2/3 max-w-xs rounded-full" />
                </div>
              </div>
            </div>
          ) : null}

          {failed ? (
            <div className="mt-6 border-s-2 border-clay ps-4 text-[0.9375rem] leading-relaxed text-clay">
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
                  className="rounded-full border border-border bg-card px-4 py-2 text-[0.875rem] transition-colors hover:border-leaf/40 hover:bg-accent disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          {/*
            What the assistant is looking at, stated rather than implied. The
            scheme travels invisibly in the context, and an invisible
            attachment is one the person cannot tell is missing when it is —
            so it is shown, and it links back to the page they came from.
          */}
          {scheme ? (
            <Link
              href={`/schemes/${scheme.slug}`}
              className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-full border border-border
                         bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground
                         transition-colors hover:border-leaf/40 hover:text-foreground"
            >
              <FileText className="size-3.5 shrink-0 text-leaf" />
              <span className="line-clamp-1">{scheme.name}</span>
            </Link>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-1 rounded-[1.5rem] border border-border bg-card p-2 shadow-[0_1px_2px_rgb(28_26_23/0.04),0_10px_30px_-22px_rgb(28_26_23/0.4)] transition-colors focus-within:border-leaf/50"
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
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none [scrollbar-width:none] placeholder:text-faint disabled:opacity-60 [&::-webkit-scrollbar]:hidden"
            />
            <VoiceButton
              disabled={busy}
              onInterim={(text) => setDraft(text)}
              onTranscript={(text) => send(text)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full text-muted-foreground"
              onClick={restart}
              disabled={busy || empty}
              aria-label={t("chat.restart")}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              disabled={busy || !draft.trim()}
              aria-label={t("chat.send")}
            >
              <ArrowUp className="size-4" />
            </Button>
          </form>

          <ModeNote agentic={agentic} hideWide={showHeading === "mobile"} />
        </div>
      </div>
    </div>
  );
}

/** Starter questions, phrased the way people actually ask them. */
function Opening({
  onPick,
  agentic,
  showHeading,
}: {
  onPick: (message: string) => void;
  agentic: boolean | null;
  showHeading: boolean | "mobile";
}) {
  const { t } = useLanguage();
  // Written in the reader's language, because these teach what can be asked —
  // and an English example teaches the wrong lesson to exactly the person who
  // needed the translation.
  const suggestions = [
    t("chat.try1"), t("chat.try2"), t("chat.try3"), t("chat.try4"),
  ];

  return (
    <div className="flex flex-col items-center pb-8 text-center">
      {showHeading ? (
        <div
          className={cn(
            "flex flex-col items-center",
            showHeading === "mobile" && "lg:hidden",
          )}
        >
          <Orb className="size-12" />
          <h2 className="mt-4 text-[1.625rem] sm:text-[1.875rem]">
            {t("chat.title")}
          </h2>
        </div>
      ) : null}
      <p
        className={cn(
          "max-w-[54ch] text-[0.9375rem] leading-relaxed text-muted-foreground sm:text-[1rem]",
          showHeading === "mobile" && "mt-4 lg:mt-0",
          showHeading === true && "mt-4",
        )}
      >
        {t("chat.lede")}
      </p>

      {/* Sample questions only make sense when open questions are understood.
          In the guided flow the options below the composer are the way in. */}
      <div className={agentic ? "mt-9 w-full max-w-xl" : "hidden"}>
        <p className="meta">{t("chat.try.label")}</p>
        <div className="mt-4 flex flex-col gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 text-start text-[0.9375rem] leading-relaxed transition-colors hover:border-leaf/40 hover:bg-accent"
            >
              <span>{suggestion}</span>
              <ArrowUp className="size-4 shrink-0 rotate-45 text-faint transition-colors group-hover:text-leaf" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2 lg:hidden">
        <span className="meta">{t("chat.orWhatsApp")}</span>
        <WhatsAppDoor size="pill" />
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
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card">
              <Icon className="size-3" />
            </span>
            <span className="text-foreground">{step.label}</span>
            {step.summary ? <span>· {step.summary}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function ModeNote({
  agentic,
  hideWide,
}: {
  agentic: boolean | null;
  hideWide?: boolean;
}) {
  const { t } = useLanguage();
  if (agentic === null) return null;
  return (
    <p
      className={cn(
        "mt-2.5 px-1 text-[0.75rem] leading-relaxed text-faint",
        // The rail prints this on a wide screen; two copies of the same
        // sentence on one screen reads as a bug.
        hideWide && "lg:hidden",
      )}
    >
      {t(agentic ? "chat.mode.agentic" : "chat.mode.guided")}
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
            <span className="font-display text-[1.5rem] font-normal text-primary tabular-nums">
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
            blocked ? "border-clay/30" : "border-verified/40",
          )}
        >
          <div className="flex items-start gap-2.5">
            {blocked ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-clay" />
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
                  blocked ? "text-clay" : "text-verified",
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
                <XCircle className="size-3.5 shrink-0 text-clay" />
                <dt className="font-medium text-clay">{item}</dt>
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
        <div className="rounded-xl border border-clay/25 bg-clay-soft p-4">
          <p className="text-sm font-semibold text-clay">
            {s("alt_label")} → {s("alt_amount")}
          </p>
          <p className="mt-1 text-sm text-clay/90">
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
              ? "border-clay/25 bg-clay-soft text-clay"
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


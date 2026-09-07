"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Loader2, LocateFixed, MapPin } from "lucide-react";

import { OptionRow } from "@/components/option-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogMeta } from "@/lib/api";
import {
  CASTES,
  EMPLOYMENT,
  GENDERS,
  MARITAL,
  OCCUPATIONS,
  RESIDENCE,
  YES_NO,
  type Answers,
  answersToQuery,
  answersToPayload,
} from "@/lib/facets";
import { cn } from "@/lib/utils";

export function CheckForm({
  meta,
  className,
}: {
  meta: CatalogMeta;
  className?: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [matched, setMatched] = useState<number | null>(null);
  const [targeted, setTargeted] = useState(0);
  const [counting, setCounting] = useState(false);
  const [navigating, startNavigating] = useTransition();

  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((prev) => {
      // Tapping the selected option again clears it. Every answer must be
      // retractable, or a mis-tap becomes a wrong result the person cannot undo.
      const next = { ...prev };
      if (prev[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  // Live count. Debounced, and stale replies are dropped so a slow request
  // cannot overwrite the answer to a newer one.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setCounting(true);
      try {
        const response = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...answersToPayload(answers), limit: 1 }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (id === requestId.current) {
          setMatched(data.total_matched ?? null);
          setTargeted(data.total_targeted ?? 0);
        }
      } catch {
        if (id === requestId.current) setMatched(null);
      } finally {
        if (id === requestId.current) setCounting(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [answers]);

  const answered = Object.keys(answers).length;

  const submit = () => {
    startNavigating(() => {
      router.push(`/check/results?${answersToQuery(answers)}`);
    });
  };

  return (
    <div className={cn("grid gap-8 lg:grid-cols-[1fr_300px]", className)}>
      <form
        className="min-w-0 space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Section
          step={1}
          title="What do you need help with?"
          hint="Pick as many as apply, or none to see everything."
        >
          <div className="flex flex-wrap gap-2">
            {meta.categories.map((category) => {
              const active = answers.categories?.includes(category.name);
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => {
                      const current = prev.categories ?? [];
                      const next = current.includes(category.name)
                        ? current.filter((c) => c !== category.name)
                        : [...current, category.name];
                      const copy = { ...prev };
                      if (next.length) copy.categories = next;
                      else delete copy.categories;
                      return copy;
                    })
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          step={2}
          title="Where do you live?"
          hint="Most schemes are run by one state, so this matters more than anything else."
        >
          <LocationPicker
            meta={meta}
            state={answers.state}
            onState={(state) =>
              setAnswers((prev) => {
                const next = { ...prev };
                if (state) next.state = state;
                else delete next.state;
                return next;
              })
            }
          />
          <div className="mt-5">
            <OptionRow
              label="Is that a village or a town?"
              options={RESIDENCE}
              value={answers.residence}
              onSelect={(value) => set("residence", value)}
            />
          </div>
        </Section>

        <Section step={3} title="About you">
          <div className="space-y-5">
            <OptionRow
              label="Which community do you belong to?"
              options={CASTES}
              value={answers.caste}
              onSelect={(value) => set("caste", value)}
            />
            <OptionRow
              label="Gender"
              options={GENDERS}
              value={answers.gender}
              onSelect={(value) => set("gender", value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="age" className="text-sm font-medium">
                  Age
                </Label>
                <Input
                  id="age"
                  inputMode="numeric"
                  placeholder="e.g. 34"
                  className="mt-1.5 h-11 bg-card text-base"
                  value={answers.age ?? ""}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D/g, "");
                    setAnswers((prev) => {
                      const next = { ...prev };
                      if (value) next.age = value;
                      else delete next.age;
                      return next;
                    });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="income" className="text-sm font-medium">
                  Household income for a year
                </Label>
                <Input
                  id="income"
                  inputMode="numeric"
                  placeholder="e.g. 180000"
                  className="mt-1.5 h-11 bg-card text-base"
                  value={answers.family_income ?? ""}
                  onChange={(event) => {
                    const value = event.target.value.replace(/[^\d]/g, "");
                    setAnswers((prev) => {
                      const next = { ...prev };
                      if (value) next.family_income = value;
                      else delete next.family_income;
                      return next;
                    });
                  }}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Everyone in the house together, not only what you earn.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section
          step={4}
          title="Anything else that applies"
          hint="Each of these unlocks schemes reserved for people it applies to."
        >
          <div className="space-y-5">
            <OptionRow
              label="Do you have a BPL card?"
              options={YES_NO}
              value={answers.is_bpl}
              onSelect={(value) => set("is_bpl", value)}
            />
            <OptionRow
              label="Does anyone in the household have a disability?"
              options={YES_NO}
              value={answers.disability}
              onSelect={(value) => set("disability", value)}
            />
            <OptionRow
              label="Are you studying?"
              options={YES_NO}
              value={answers.is_student}
              onSelect={(value) => set("is_student", value)}
            />
            <OptionRow
              label="Marital status"
              options={MARITAL}
              value={answers.marital_status}
              onSelect={(value) => set("marital_status", value)}
            />
            <OptionRow
              label="Work"
              options={EMPLOYMENT}
              value={answers.employment_status}
              onSelect={(value) => set("employment_status", value)}
            />
            <div>
              <Label htmlFor="occupation" className="text-sm font-medium">
                What work do you do?
              </Label>
              <select
                id="occupation"
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                value={answers.occupation ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setAnswers((prev) => {
                    const next = { ...prev };
                    if (value) next.occupation = value;
                    else delete next.occupation;
                    return next;
                  });
                }}
              >
                <option value="">Not listed / prefer not to say</option>
                {OCCUPATIONS.map((occupation) => (
                  <option key={occupation} value={occupation}>
                    {occupation}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <div className="lg:hidden">
          <SubmitButton navigating={navigating} onClick={submit} />
        </div>
      </form>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <div className="card-quiet p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Matching so far
            </p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums text-primary">
              {counting && matched === null ? (
                <Loader2 className="size-8 animate-spin" />
              ) : (
                (matched ?? meta.total).toLocaleString("en-IN")
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {answered === 0
                ? "schemes, before you narrow anything down"
                : `schemes, from ${answered} ${answered === 1 ? "answer" : "answers"}`}
            </p>

            {targeted > 0 ? (
              <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-sm font-medium text-gold-ink">
                {targeted.toLocaleString("en-IN")} of them are aimed at people
                like you
              </p>
            ) : null}

            <SubmitButton
              className="mt-5 w-full"
              navigating={navigating}
              onClick={submit}
            />
          </div>

          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Nothing here is stored. The answers live in this page only, and go no
            further than the matching request.
          </p>
        </div>
      </aside>
    </div>
  );
}

function SubmitButton({
  navigating,
  onClick,
  className,
}: {
  navigating: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className={cn("h-12 px-6 text-base", className)}
      onClick={onClick}
      disabled={navigating}
    >
      {navigating ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Finding schemes…
        </>
      ) : (
        <>
          Show my schemes
          <ArrowRight className="size-4" />
        </>
      )}
    </Button>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-quiet p-6">
      <div className="flex items-baseline gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
          {step}
        </span>
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {hint ? (
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Three ways in, hardest last: one tap for location, six digits for a PIN, or
 * a list of states that always works. The previous build offered five hardcoded
 * cities, which is not a location feature.
 */
function LocationPicker({
  meta,
  state,
  onState,
}: {
  meta: CatalogMeta;
  state?: string;
  onState: (state?: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  const states = useMemo(
    () => meta.states.filter((s) => s.name !== "All").map((s) => s.name),
    [meta.states],
  );

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus("This browser cannot share your location. Use the PIN code instead.");
      return;
    }
    setBusy(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/geo/reverse?lat=${latitude}&lon=${longitude}`,
          );
          const place = await response.json();
          if (place.state) {
            onState(place.state);
            setStatus(
              place.district ? `${place.district}, ${place.state}` : place.state,
            );
          } else {
            setStatus("We could not place those coordinates. Try your PIN code.");
          }
        } catch {
          setStatus("The lookup failed. Try your PIN code instead.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setStatus("Location was not shared. Your PIN code works just as well.");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  };

  const lookupPin = async (value: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/geo/pin/${value}`);
      const place = await response.json();
      if (place.state) {
        onState(place.state);
        setStatus(
          place.district ? `${place.district}, ${place.state}` : place.state,
        );
      } else {
        setStatus("That PIN code did not match. Pick your state below.");
      }
    } catch {
      setStatus("The lookup failed. Pick your state below.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11 justify-start bg-card px-4"
          onClick={useMyLocation}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LocateFixed className="size-4" />
          )}
          Use my location
        </Button>

        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="or PIN code"
            className="h-11 w-40 bg-card text-base"
            value={pin}
            aria-label="PIN code"
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(value);
              if (value.length === 6) void lookupPin(value);
            }}
          />
        </div>
      </div>

      {status ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5" />
          {status}
        </p>
      ) : null}

      <div className="mt-4">
        <Label htmlFor="state" className="text-sm font-medium">
          State
        </Label>
        <select
          id="state"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
          value={state ?? ""}
          onChange={(event) => onState(event.target.value || undefined)}
        >
          <option value="">All of India</option>
          {states.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Central schemes are always included alongside your state.
        </p>
      </div>
    </div>
  );
}

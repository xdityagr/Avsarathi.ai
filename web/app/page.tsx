import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Calculator,
  FileSearch,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

import { CategoryGrid } from "@/components/category-grid";
import { ButtonLink } from "@/components/ui/button-link";
import { getCatalogMeta } from "@/lib/api";
import { formatNumber } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n";

const STEPS = [
  { icon: FileSearch, title: "home.step1.title", body: "home.step1.body" },
  { icon: BadgeCheck, title: "home.step2.title", body: "home.step2.body" },
  { icon: MapPin, title: "home.step3.title", body: "home.step3.body" },
] as const;

const DIFFERENCES = [
  { icon: ShieldCheck, title: "home.diff1.title", body: "home.diff1.body" },
  { icon: Calculator, title: "home.diff2.title", body: "home.diff2.body" },
  { icon: Banknote, title: "home.diff3.title", body: "home.diff3.body" },
  { icon: MessageCircle, title: "home.diff4.title", body: "home.diff4.body" },
] as const;

export default async function HomePage() {
  const [meta, lang] = await Promise.all([getCatalogMeta(), getLang()]);
  const t = translator(lang);
  const schemeCount = meta.total || 4736;
  const stateCount = meta.states.filter((s) => s.name !== "All").length || 36;
  const count = formatNumber(lang, schemeCount);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--secondary),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-gold" />
                {t("home.badge")}
              </p>

              <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                {t("home.h1.line1")}
                <br />
                <span className="text-primary">{t("home.h1.line2")}</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                {t("home.lede", { count })}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/check" size="lg" className="h-12 px-6 text-base">
                  {t("home.cta.primary")}
                  <ArrowRight className="size-4" />
                </ButtonLink>
                <ButtonLink
                  href="/schemes"
                  size="lg"
                  variant="outline"
                  className="h-12 bg-card px-6 text-base"
                >
                  {t("home.cta.secondary")}
                </ButtonLink>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                {t("home.reassurance")}
              </p>
            </div>

            <MatchPreview />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Numbers */}
      <section className="border-b border-border bg-card">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { value: count, label: t("home.stat.schemes") },
            { value: formatNumber(lang, meta.categories.length || 15), label: t("home.stat.categories") },
            { value: formatNumber(lang, stateCount), label: t("home.stat.states") },
            { value: formatNumber(lang, 5), label: t("home.stat.languages") },
          ].map((stat) => (
            <div key={stat.label} className="bg-card px-4 py-8 text-center">
              <dt className="font-display text-3xl font-bold text-primary sm:text-4xl">
                {stat.value}
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --------------------------------------------------------- How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          {t("home.steps.h2")}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="card-quiet p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-semibold text-muted-foreground">
                  {t("home.step")} {index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t(step.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(step.body)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- Categories */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                {t("home.categories.h2")}
              </h2>
              <p className="mt-3 text-muted-foreground">
                {t("home.categories.lede")}
              </p>
            </div>
            <ButtonLink
              href="/schemes"
              variant="outline"
              className="h-10 bg-paper px-4"
            >
              {t("home.categories.cta", { count })}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
          <CategoryGrid categories={meta.categories} className="mt-10" />
        </div>
      </section>

      {/* --------------------------------------------------------- Differences */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          {t("home.diff.h2")}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {DIFFERENCES.map((item) => (
            <div key={item.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-ink">
                <item.icon className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{t(item.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(item.body)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="border-t border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                {t("home.final.h2")}
              </h2>
              <p className="mt-3 text-primary-foreground/80">
                {t("home.final.body")}
              </p>
            </div>
            <ButtonLink
              href="/check"
              size="lg"
              className="h-12 bg-gold px-8 text-base font-semibold text-gold-ink hover:bg-gold/90"
            >
              {t("home.final.cta")}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * A real result, rendered statically. It shows the shape of the answer — a
 * verdict, the reason for it, and the money — before anyone has typed anything.
 * The figures are the ones the engine actually produces for this profile.
 */
function MatchPreview() {
  return (
    <div className="card-quiet overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Sunita · Ballia, UP · SC · ₹2.8L
        </p>
        <span className="rounded-full bg-verified-soft px-2.5 py-1 text-xs font-semibold text-verified">
          3 matches
        </span>
      </div>

      <div className="divide-y divide-border">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold leading-snug">Micro Finance Scheme</h3>
            <span className="shrink-0 rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-ink">
              Cheapest
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ₹1,20,000 at 6% · quarterly repayment
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">You repay each quarter</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">₹12,568</dd>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">Interest, in total</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">₹17,272</dd>
            </div>
          </dl>
        </div>

        <div className="bg-caution-soft px-5 py-4">
          <p className="text-sm font-semibold text-caution">
            A moneylender at 60% would take ₹1,08,000 in interest
          </p>
          <p className="mt-1 text-sm text-caution/90">
            Six times more, for the same ₹1,20,000.
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Where to go
          </p>
          <p className="mt-2 text-sm font-medium">
            UP Scheduled Castes Finance &amp; Development Corporation
          </p>
          <p className="text-sm text-muted-foreground">
            Ballia district office · 4.2 km · funds fully deployed last year
          </p>
        </div>
      </div>
    </div>
  );
}

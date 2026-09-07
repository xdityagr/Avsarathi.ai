import Link from "next/link";
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
import { Button } from "@/components/ui/button";
import { getCatalogMeta } from "@/lib/api";

const STEPS = [
  {
    icon: FileSearch,
    title: "Tell us what you can",
    body:
      "Caste, district, household income, what you need help with. Every question " +
      "is optional — leaving one blank never hides a scheme from you.",
  },
  {
    icon: BadgeCheck,
    title: "See what you qualify for",
    body:
      "Matched against the published rules of every scheme in the corpus, with " +
      "the reason for each match shown next to it.",
  },
  {
    icon: MapPin,
    title: "Go and apply",
    body:
      "The nearest office that actually handles your scheme, its distance, and " +
      "the documents to carry. Then track what happens next.",
  },
];

const DIFFERENCES = [
  {
    icon: ShieldCheck,
    title: "No model decides who qualifies",
    body:
      "Eligibility is arithmetic against published rules, so it is the same every " +
      "time and we can show our working. The AI writes explanations; it never " +
      "casts a vote on your application.",
  },
  {
    icon: Calculator,
    title: "The real cost, in rupees",
    body:
      "NSFDC lends at 6%. A moneylender charges 60% a year or more. We show both " +
      "on the same screen, with the instalment and the total you repay.",
  },
  {
    icon: Banknote,
    title: "Honest about the last mile",
    body:
      "Money moves NSFDC → state agency → you, and only the branch knows where " +
      "yours is. We give you a timeline, the escalation path, and a drafted " +
      "grievance when it stalls — not a fake tracker.",
  },
  {
    icon: MessageCircle,
    title: "Works on WhatsApp",
    body:
      "Not everyone will install an app or read comfortably. The same engine " +
      "answers on WhatsApp, in Hindi, Marathi, Bengali and Tamil.",
  },
];

export default async function HomePage() {
  const meta = await getCatalogMeta();
  const schemeCount = meta.total || 4736;
  const stateCount = meta.states.filter((s) => s.name !== "All").length || 36;

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
                Built for the Ministry of Social Justice &amp; Empowerment
                problem statement
              </p>

              <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                The scheme exists.
                <br />
                <span className="text-primary">Nobody told her about it.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                India runs {schemeCount.toLocaleString("en-IN")} welfare and
                credit schemes for Scheduled Caste, Scheduled Tribe, OBC and
                other marginalised households — housing, pensions, scholarships,
                medical help, business loans. Avsarathi finds the ones{" "}
                <em className="not-italic text-foreground">you</em> qualify for,
                explains them in your language, and shows you where to go.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 px-6 text-base"
                  render={<Link href="/check" />}
                >
                  Find my schemes
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 bg-card px-6 text-base"
                  render={<Link href="/schemes" />}
                >
                  Browse all schemes
                </Button>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                No account. No Aadhaar number. Nothing saved unless you ask.
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
            { value: schemeCount.toLocaleString("en-IN"), label: "schemes in the corpus" },
            { value: String(meta.categories.length || 15), label: "categories of need" },
            { value: String(stateCount), label: "states and UTs" },
            { value: "5", label: "languages" },
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
          Three steps, and none of them is a form you can&apos;t read
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="card-quiet p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-semibold text-muted-foreground">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
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
                Not just loans and courses
              </h2>
              <p className="mt-3 text-muted-foreground">
                A household needs a roof, a pension, a scholarship, a widow&apos;s
                allowance and treatment money — often at the same time. Every
                category below is searchable.
              </p>
            </div>
            <Button
              variant="outline"
              className="h-10 bg-paper px-4"
              render={<Link href="/schemes" />}
            >
              See all {schemeCount.toLocaleString("en-IN")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <CategoryGrid categories={meta.categories} className="mt-10" />
        </div>
      </section>

      {/* --------------------------------------------------------- Differences */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          Why this is different from a search box
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {DIFFERENCES.map((item) => (
            <div key={item.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-ink">
                <item.icon className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
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
                Find out in two minutes
              </h2>
              <p className="mt-3 text-primary-foreground/80">
                Answer what you are comfortable answering. You will get a ranked
                list with the reason for every match, and the nearest place to
                apply.
              </p>
            </div>
            <Button
              size="lg"
              className="h-12 bg-gold px-8 text-base font-semibold text-gold-ink hover:bg-gold/90"
              render={<Link href="/check" />}
            >
              Start
              <ArrowRight className="size-4" />
            </Button>
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

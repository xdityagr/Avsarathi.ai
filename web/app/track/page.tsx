import { ApplicationTracker } from "@/components/application-tracker";

export const metadata = {
  title: "Track an application",
  description:
    "Follow your application through sanction and disbursement, and escalate " +
    "with a drafted grievance when it stalls.",
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Track an application
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Applying is not the end of it. Most people who give up do so after
          applying, because nobody tells them what is supposed to happen next or
          how long it should take.
        </p>
      </header>

      {/* Saying this plainly is the honest thing and, as it happens, the useful
          one. Every "live tracker" for these schemes is either scraping a portal
          that blocks bots or quietly making it up. */}
      <section className="mt-8 rounded-xl border border-border bg-gold-soft p-5">
        <h2 className="font-semibold text-gold-ink">
          What we can and cannot see
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gold-ink/90">
          We cannot read your file. NSFDC money moves to a state agency and then
          to you, and only the branch handling your case knows where it is —
          NSFDC&apos;s own FAQ says applicants should not contact them directly.
          There is no public API for payment status either. So this is a timeline
          you keep, with the official links to check the real thing and the
          escalation route when a stage overruns.
        </p>
      </section>

      <ApplicationTracker className="mt-8" />
    </div>
  );
}

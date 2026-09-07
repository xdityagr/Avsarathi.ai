import { Building2, ExternalLink, TrendingUp } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";

export const metadata = {
  title: "Where to apply",
  description:
    "The state channelising agencies, banks and RRBs that actually disburse " +
    "NSFDC credit, with how much of their allocation they have deployed.",
};

interface Partner {
  partner_id: string;
  name: string;
  agency_type: string;
  partner_type: string;
  state: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  cumulative_utilization: number | null;
  deployable_headroom_lakh: number | null;
  net_npa_percentage: number | null;
  utilisation_confidence: string | null;
  note: string | null;
}

const API = process.env.AVSARATHI_API_ORIGIN ?? "http://127.0.0.1:8001";

async function getPartners(): Promise<Partner[]> {
  try {
    const response = await fetch(`${API}/api/partners`, {
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.partners ?? [];
  } catch {
    return [];
  }
}

export default async function PartnersPage() {
  const partners = await getPartners();

  const byState = new Map<string, Partner[]>();
  for (const partner of partners) {
    const list = byState.get(partner.state) ?? [];
    list.push(partner);
    byState.set(partner.state, list);
  }
  const states = [...byState.keys()].sort();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Where the money actually comes from
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          NSFDC does not lend to people directly. It routes funds through a state
          channelising agency, a bank or a regional rural bank, and that office is
          the one that decides and disburses.
        </p>
      </header>

      {/* This is the part nobody else shows. An agency sitting on undeployed
          funds can say yes today; one that has spent its allocation cannot,
          however willing it is. Sending someone to the wrong counter costs them
          a day's wages and a bus fare. */}
      <section className="mt-8 rounded-xl border border-border bg-gold-soft p-5">
        <h2 className="flex items-center gap-2 font-semibold text-gold-ink">
          <TrendingUp className="size-4" />
          Why we show deployment figures
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gold-ink/90">
          An agency holding undeployed allocation has money to lend now. One that
          has used its allocation will make you wait for the next release, no
          matter how eligible you are. These percentages come from NSFDC&apos;s own
          published utilisation statements — they are the difference between a
          useful journey and a wasted one.
        </p>
      </section>

      {partners.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-caution-soft p-5 text-sm text-caution">
          The partner directory is not reachable right now. It is served by the
          engine — if you are running this locally, check that it is up.
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {states.map((state) => (
            <section key={state}>
              <h2 className="font-display text-xl font-bold">{state}</h2>
              <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                {byState.get(state)!.map((partner) => (
                  <PartnerCard key={partner.partner_id} partner={partner} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="mt-14 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-xl font-bold">
          Do not go without knowing which scheme you are asking for
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Counters turn people away for asking vaguely. Work out which scheme fits
          first, then walk in naming it, your category and your project cost.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/credit" className="h-11 px-5">
            Work out my loan
          </ButtonLink>
          <ButtonLink
            href="/check"
            variant="outline"
            className="h-11 bg-paper px-5"
          >
            Check every scheme
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  const utilisation = partner.cumulative_utilization;
  const percent = utilisation !== null ? Math.round(utilisation * 100) : null;

  // Below 100% means undeployed funds remain. The reading is deliberately this
  // way round: an agency that has deployed everything is the constrained one.
  const tone =
    percent === null
      ? "muted"
      : percent < 90
        ? "verified"
        : percent < 100
          ? "gold"
          : "caution";

  const tones = {
    verified: "bg-verified-soft text-verified",
    gold: "bg-gold-soft text-gold-ink",
    caution: "bg-caution-soft text-caution",
    muted: "bg-muted text-muted-foreground",
  } as const;

  return (
    <li className="card-quiet p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{partner.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {partner.district ? `${partner.district} · ` : ""}
            {partner.agency_type}
          </p>
        </div>
        {percent !== null ? (
          <span
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums ${tones[tone]}`}
          >
            {percent}% deployed
          </span>
        ) : null}
      </div>

      {partner.note ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {partner.note}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {partner.utilisation_confidence ? (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" />
            {partner.utilisation_confidence === "OFFICIAL"
              ? "From NSFDC's published statement"
              : `Confidence: ${partner.utilisation_confidence.toLowerCase()}`}
          </span>
        ) : null}
        {partner.net_npa_percentage !== null ? (
          <span>Net NPA {partner.net_npa_percentage}%</span>
        ) : null}
        {partner.latitude && partner.longitude ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${partner.latitude}&mlon=${partner.longitude}#map=13/${partner.latitude}/${partner.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            Map
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

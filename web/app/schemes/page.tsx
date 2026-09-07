import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import { SchemeFilters } from "@/components/scheme-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { browseSchemes, getCatalogMeta, type SchemeCard } from "@/lib/api";

export const metadata = {
  title: "All schemes",
  description:
    "Browse every welfare and credit scheme in the Avsarathi corpus, filtered " +
    "by category, state and level of government.",
};

const PAGE_SIZE = 24;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SchemesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = one(params.q) ?? "";
  const category = one(params.category);
  const state = one(params.state);
  const level = one(params.level);
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const [meta, results] = await Promise.all([
    getCatalogMeta(),
    browseSchemes({ q, category, state, level, page, page_size: PAGE_SIZE }),
  ]);

  const lastPage = Math.max(1, Math.ceil(results.total / PAGE_SIZE));
  const filtered = Boolean(q || category || state || level);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Every scheme we hold
        </h1>
        <p className="mt-3 text-muted-foreground">
          {meta.total.toLocaleString("en-IN")} central and state schemes,
          reproduced from official sources with a link back to each one. Search
          without telling us anything about yourself.
        </p>
      </header>

      {/* Search is a plain GET form so it works before JavaScript loads and the
          URL stays shareable — a field worker can send a filtered link on. */}
      <form method="GET" className="mt-8 flex flex-col gap-3 sm:flex-row">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {state ? <input type="hidden" name="state" value={state} /> : null}
        {level ? <input type="hidden" name="level" value={level} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Scholarship, pension, housing, loan…"
            className="h-11 bg-card pl-9 text-base"
            aria-label="Search schemes"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-6">
          Search
        </Button>
      </form>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" />
            Filter
          </h2>
          <SchemeFilters
            meta={meta}
            active={{ q, category, state, level }}
            className="mt-4"
          />
        </aside>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
            <p className="text-sm text-muted-foreground">
              {results.total === 0 ? (
                "No schemes match those filters"
              ) : (
                <>
                  <span className="font-semibold text-foreground tabular-nums">
                    {results.total.toLocaleString("en-IN")}
                  </span>{" "}
                  {results.total === 1 ? "scheme" : "schemes"}
                  {filtered ? " match" : ""} · page {results.page} of {lastPage}
                </>
              )}
            </p>
            {filtered ? (
              <Link
                href="/schemes"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Clear filters
              </Link>
            ) : null}
          </div>

          {!results.corpus_available ? (
            <p className="mt-8 rounded-lg border border-border bg-caution-soft p-4 text-sm text-caution">
              The scheme list is not available right now. It is a local copy that
              may be rebuilding — searching again in a minute usually works.
            </p>
          ) : null}

          {results.items.length === 0 && results.corpus_available ? (
            <EmptyState />
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {results.items.map((scheme) => (
                <SchemeListCard key={scheme.slug} scheme={scheme} />
              ))}
            </ul>
          )}

          <Pagination
            page={results.page}
            lastPage={lastPage}
            params={{ q, category, state, level }}
          />
        </section>
      </div>
    </div>
  );
}

function SchemeListCard({ scheme }: { scheme: SchemeCard }) {
  return (
    <li className="card-quiet flex flex-col p-5 transition-colors hover:border-primary/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          {scheme.level ?? "Scheme"}
        </span>
        {scheme.state && scheme.state !== "All" ? (
          <span className="text-xs text-muted-foreground">{scheme.state}</span>
        ) : null}
      </div>

      <h3 className="mt-3 font-semibold leading-snug">
        <Link href={`/schemes/${scheme.slug}`} className="hover:text-primary">
          <span className="absolute inset-0" aria-hidden />
          {scheme.name.trim()}
        </Link>
      </h3>

      {scheme.brief ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {scheme.brief}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5 pt-1">
        {scheme.categories.slice(0, 2).map((category) => (
          <span
            key={category}
            className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            {category}
          </span>
        ))}
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">Nothing matched that.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Try a plainer word — &ldquo;pension&rdquo; rather than &ldquo;old age
        monthly support&rdquo; — or clear a filter. If you tell us about
        yourself instead, we can search on your behalf.
      </p>
      <Button className="mt-6 h-10 px-5" render={<Link href="/check" />}>
        Check my eligibility
      </Button>
    </div>
  );
}

function Pagination({
  page,
  lastPage,
  params,
}: {
  page: number;
  lastPage: number;
  params: Record<string, string | undefined>;
}) {
  if (lastPage <= 1) return null;

  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    query.set("page", String(target));
    return `/schemes?${query}`;
  };

  return (
    <nav
      className="mt-10 flex items-center justify-between border-t border-border pt-6"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Button variant="outline" className="h-10" render={<Link href={href(page - 1)} />}>
          Previous
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        {page} / {lastPage}
      </span>
      {page < lastPage ? (
        <Button variant="outline" className="h-10" render={<Link href={href(page + 1)} />}>
          Next
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getScheme, type SchemeDetail } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scheme = await getScheme(slug);
  if (!scheme) return { title: "Scheme not found" };
  return {
    title: scheme.name.trim(),
    description: scheme.brief ?? undefined,
  };
}

export default async function SchemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scheme = await getScheme(slug);
  if (!scheme) notFound();

  const sections = [
    { title: "What you get", body: scheme.benefits_md },
    { title: "Who can apply", body: scheme.eligibility_md },
    { title: "Who cannot apply", body: scheme.exclusions_md },
    { title: "How to apply", body: scheme.application_md },
    { title: "Documents to carry", body: scheme.documents_md },
  ].filter((section) => section.body?.trim());

  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/schemes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        All schemes
      </Link>

      <header className="mt-6 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            {scheme.level ?? "Scheme"}
          </span>
          {scheme.state && scheme.state !== "All" ? (
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {scheme.state}
            </span>
          ) : null}
          {scheme.categories.map((category) => (
            <Link
              key={category}
              href={`/schemes?category=${encodeURIComponent(category)}`}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              {category}
            </Link>
          ))}
        </div>

        <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight sm:text-4xl">
          {scheme.name.trim()}
        </h1>

        {scheme.ministry ? (
          <p className="mt-3 text-sm text-muted-foreground">{scheme.ministry}</p>
        ) : null}

        {scheme.brief ? (
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {scheme.brief}
          </p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {sections.length === 0 ? (
            <NotYetFetched scheme={scheme} />
          ) : (
            sections.map((section) => (
              <section key={section.title} className="mb-8">
                <h2 className="font-display text-xl font-bold">{section.title}</h2>
                <Markdown className="mt-2">{section.body}</Markdown>
              </section>
            ))
          )}

          {scheme.details_md?.trim() ? (
            <section className="mb-8">
              <h2 className="font-display text-xl font-bold">Details</h2>
              <Markdown className="mt-2">{scheme.details_md}</Markdown>
            </section>
          ) : null}

          {scheme.faqs?.length ? (
            <section className="mb-8">
              <h2 className="font-display text-xl font-bold">
                Questions people ask
              </h2>
              <Accordion className="mt-3">
                {scheme.faqs.map((faq, index) => (
                  <AccordionItem key={index} value={String(index)}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent>
                      <Markdown>{faq.answer}</Markdown>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card-quiet p-5">
            <h2 className="text-sm font-semibold">Do I qualify?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Answer a few optional questions and we will check this scheme along
              with every other one you might be entitled to.
            </p>
            <Button className="mt-4 h-10 w-full" render={<Link href="/check" />}>
              Check my eligibility
            </Button>
          </div>

          <Provenance scheme={scheme} />
        </aside>
      </div>
    </article>
  );
}

/**
 * Where the text came from and when. Shown on every scheme because a person
 * about to travel to a government office deserves to know how fresh this is
 * and how to check it against the original.
 */
function Provenance({ scheme }: { scheme: SchemeDetail }) {
  const fetched = scheme.fetched_at
    ? new Date(scheme.fetched_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-5">
      <h2 className="text-sm font-semibold">Source</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Reproduced from myScheme, the Government of India&apos;s scheme portal.
        {fetched ? ` Copied on ${fetched}.` : ""}
      </p>
      <a
        href={scheme.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Open on myScheme
        <ExternalLink className="size-3.5" />
      </a>
      {scheme.official_url ? (
        <a
          href={scheme.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Official scheme website
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        Rules change. Confirm with the office before you travel.
      </p>
    </div>
  );
}

function NotYetFetched({ scheme }: { scheme: SchemeDetail }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8">
      <FileText className="size-6 text-muted-foreground" />
      <h2 className="mt-3 font-semibold">
        We have this scheme listed, but not its full text yet
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Our copy of the scheme corpus is still being built, and the detailed
        rules for this one have not been copied across. Rather than guess at
        them, here is the official page — it is the same source we use.
      </p>
      <Button
        variant="outline"
        className="mt-5 h-10"
        render={
          <a href={scheme.source_url} target="_blank" rel="noopener noreferrer" />
        }
      >
        Read it on myScheme
        <ExternalLink className="size-4" />
      </Button>
    </div>
  );
}

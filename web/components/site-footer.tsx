import Link from "next/link";

import { Logo } from "@/components/logo";

const COLUMNS = [
  {
    title: "Find",
    links: [
      { href: "/check", label: "Check eligibility" },
      { href: "/schemes", label: "Browse all schemes" },
      { href: "/credit", label: "NSFDC loans" },
    ],
  },
  {
    title: "Act",
    links: [
      { href: "/partners", label: "Where to apply" },
      { href: "/track", label: "Track an application" },
      { href: "/chat", label: "Ask a question" },
    ],
  },
  {
    title: "Sources",
    links: [
      { href: "https://www.myscheme.gov.in", label: "myScheme (Govt. of India)" },
      { href: "https://nsfdc.nic.in", label: "NSFDC" },
      { href: "https://pfms.nic.in", label: "PFMS — payment status" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Scheme information is reproduced from official government sources
              with a link back to each one. We never decide your eligibility with
              a language model.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          Avsarathi is not a government website and cannot approve, sanction or
          disburse anything. It helps you find what you are entitled to and shows
          you where to go. Always confirm details with the office named on the
          scheme page.
        </p>
      </div>
    </footer>
  );
}

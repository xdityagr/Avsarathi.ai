import Link from "next/link";

import { Logo } from "@/components/logo";
import { getT } from "@/lib/i18n/server";
import { DICTIONARY, type StringKey } from "@/lib/i18n/dictionary";

/** Official names — myScheme, NSFDC, PFMS — are never translated. */
function isKey(value: string): value is StringKey {
  return value in DICTIONARY;
}

const COLUMNS = [
  {
    title: "footer.find",
    links: [
      { href: "/check", label: "nav.check" },
      { href: "/schemes", label: "nav.schemes" },
      { href: "/credit", label: "nav.credit" },
    ],
  },
  {
    title: "footer.act",
    links: [
      { href: "/partners", label: "nav.partners" },
      { href: "/track", label: "nav.track" },
      { href: "/chat", label: "nav.chat" },
    ],
  },
  {
    title: "footer.sources",
    links: [
      { href: "https://www.myscheme.gov.in", label: "myScheme (Govt. of India)" },
      { href: "https://nsfdc.nic.in", label: "NSFDC" },
      { href: "https://pfms.nic.in", label: "PFMS — payment status" },
    ],
  },
];

export async function SiteFooter() {
  const t = await getT();

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("footer.tagline")}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {isKey(column.title) ? t(column.title) : column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline"
                    >
                      {isKey(link.label) ? t(link.label) : link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          {t("footer.disclaimer")}
        </p>
      </div>
    </footer>
  );
}

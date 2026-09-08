import Link from "next/link";

import type { CatalogMeta } from "@/lib/api";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n";
import { categoryLabel, levelLabel } from "@/lib/i18n/vocabulary";
import { cn } from "@/lib/utils";

interface Active {
  q?: string;
  category?: string;
  state?: string;
  level?: string;
}

function hrefWith(active: Active, key: keyof Active, value?: string): string {
  const query = new URLSearchParams();
  const next = { ...active, [key]: value };
  for (const [k, v] of Object.entries(next)) {
    if (v) query.set(k, v);
  }
  const search = query.toString();
  return search ? `/schemes?${search}` : "/schemes";
}

function FilterGroup({
  title,
  options,
  activeValue,
  onKey,
  active,
  limit,
  lang,
  label,
}: {
  title: string;
  options: { name: string; count: number }[];
  activeValue?: string;
  onKey: keyof Active;
  active: Active;
  limit?: number;
  lang: Lang;
  /**
   * How to show this option's name. The VALUE stays the English one the
   * corpus is indexed by — translate that and `?category=…` matches nothing,
   * silently — so only what the reader sees is swapped.
   */
  label?: (lang: Lang, name: string) => string;
}) {
  if (options.length === 0) return null;

  // When a filter is applied, show it even if it falls outside the top slice —
  // a selected value that vanishes from its own list is disorienting.
  const shown = limit ? options.slice(0, limit) : options;
  const selected = options.find((o) => o.name === activeValue);
  const list =
    selected && !shown.some((o) => o.name === selected.name)
      ? [selected, ...shown]
      : shown;

  return (
    <div className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-3 space-y-0.5">
        {list.map((option) => {
          const isActive = option.name === activeValue;
          return (
            <li key={option.name}>
              <Link
                href={hrefWith(active, onKey, isActive ? undefined : option.name)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-secondary font-medium text-primary"
                    : "text-foreground/80 hover:bg-accent",
                )}
              >
                <span className="truncate">
                  {label ? label(lang, option.name) : option.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {option.count.toLocaleString(`${lang}-IN`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SchemeFilters({
  meta,
  active,
  className,
  lang,
  t,
}: {
  meta: CatalogMeta;
  active: Active;
  className?: string;
  lang: Lang;
  t: Translate;
}) {
  // "All" is not a state a person lives in — it is how the corpus marks a
  // central scheme, and those are already included in every state's results.
  const states = meta.states.filter((s) => s.name !== "All");

  return (
    <div className={cn("text-sm", className)}>
      <FilterGroup
        title={t("schemes.filter.category")}
        options={meta.categories}
        activeValue={active.category}
        onKey="category"
        active={active}
        lang={lang}
        label={categoryLabel}
      />
      <FilterGroup
        title={t("schemes.filter.level")}
        options={meta.levels}
        activeValue={active.level}
        onKey="level"
        active={active}
        lang={lang}
        label={levelLabel}
      />
      {/* State names are proper nouns and stay as published. */}
      <FilterGroup
        title={t("schemes.filter.state")}
        options={states}
        activeValue={active.state}
        onKey="state"
        active={active}
        limit={12}
        lang={lang}
      />
      {states.length > 12 ? (
        <p className="pt-1 text-xs text-muted-foreground">
          {t("check.location.central")}
        </p>
      ) : null}
    </div>
  );
}

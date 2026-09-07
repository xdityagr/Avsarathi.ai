import Link from "next/link";

import type { CatalogMeta } from "@/lib/api";
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
}: {
  title: string;
  options: { name: string; count: number }[];
  activeValue?: string;
  onKey: keyof Active;
  active: Active;
  limit?: number;
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
                <span className="truncate">{option.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {option.count.toLocaleString("en-IN")}
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
}: {
  meta: CatalogMeta;
  active: Active;
  className?: string;
}) {
  // "All" is not a state a person lives in — it is how the corpus marks a
  // central scheme, and those are already included in every state's results.
  const states = meta.states.filter((s) => s.name !== "All");

  return (
    <div className={cn("text-sm", className)}>
      <FilterGroup
        title="Category"
        options={meta.categories}
        activeValue={active.category}
        onKey="category"
        active={active}
      />
      <FilterGroup
        title="Level"
        options={meta.levels}
        activeValue={active.level}
        onKey="level"
        active={active}
      />
      <FilterGroup
        title="State"
        options={states}
        activeValue={active.state}
        onKey="state"
        active={active}
        limit={12}
      />
      {states.length > 12 ? (
        <p className="pt-1 text-xs text-muted-foreground">
          Central schemes are always included alongside the state you pick.
        </p>
      ) : null}
    </div>
  );
}

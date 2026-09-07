import Link from "next/link";
import {
  Baby,
  Briefcase,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Leaf,
  LifeBuoy,
  Palette,
  Scale,
  ShieldPlus,
  Sprout,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * myScheme's category names are exact strings from its own vocabulary, so they
 * are matched here rather than renamed — a renamed category would not filter.
 * The icon is the only thing we add.
 */
const ICONS: { match: string; icon: LucideIcon }[] = [
  { match: "social welfare", icon: Users },
  { match: "education", icon: GraduationCap },
  { match: "agriculture", icon: Sprout },
  { match: "business", icon: Briefcase },
  { match: "women and child", icon: Baby },
  { match: "skills", icon: Trophy },
  { match: "health", icon: HeartPulse },
  { match: "housing", icon: Home },
  { match: "utility", icon: LifeBuoy },
  { match: "banking", icon: Landmark },
  { match: "public safety", icon: Scale },
  { match: "science", icon: ShieldPlus },
  { match: "sports", icon: Trophy },
  { match: "travel", icon: Leaf },
  { match: "art", icon: Palette },
];

function iconFor(name: string): LucideIcon {
  const lower = name.toLowerCase();
  return ICONS.find((entry) => lower.includes(entry.match))?.icon ?? HandCoins;
}

export function CategoryGrid({
  categories,
  className,
}: {
  categories: { name: string; count: number }[];
  className?: string;
}) {
  if (categories.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        The scheme list is being rebuilt. Browse or search directly in the
        meantime.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {categories.map((category) => {
        const Icon = iconFor(category.name);
        return (
          <Link
            key={category.name}
            href={`/schemes?category=${encodeURIComponent(category.name)}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-paper p-4 transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-border group-hover:ring-primary/30">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-snug">
                {category.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {category.count.toLocaleString("en-IN")} schemes
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

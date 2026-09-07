/**
 * The mark is a milestone on a road: "sarathi" is a charioteer, and the product
 * is the one who knows the way. Drawn rather than imported so it stays crisp at
 * 20px on a cheap phone.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        aria-hidden="true"
        fill="none"
      >
        <rect width="32" height="32" rx="9" fill="var(--primary)" />
        <path
          d="M9 22.5 15.2 9.5a.9.9 0 0 1 1.6 0L23 22.5"
          stroke="var(--primary-foreground)"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path d="M12.4 18.2h7.2" stroke="var(--gold)" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          Avsarathi
        </span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          अवसर + सारथी
        </span>
      </span>
    </span>
  );
}

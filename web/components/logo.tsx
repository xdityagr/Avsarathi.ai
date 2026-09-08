/**
 * The mark and the wordmark.
 *
 * "Sarathi" is a charioteer — the one who knows the road. So the mark is a sun
 * coming up over a road that runs to the horizon: the same sunrise the pages
 * are washed in, at 20px. Drawn rather than imported so it stays crisp on a
 * cheap screen, and built from two shapes so it survives being that small.
 *
 * A chariot wheel would have been the obvious choice and is deliberately not
 * used: at this size it is indistinguishable from the Ashoka Chakra, and this
 * product must never look like it is claiming to be the government itself.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className ?? "size-7"}
      aria-hidden="true"
      fill="none"
    >
      <circle cx="16" cy="12.5" r="5.2" fill="var(--gold)" />
      <path
        d="M4 22.5h24"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M10.5 27.5h11"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

/**
 * The header lockup: the name, then the two Hindi words it is built from.
 *
 * Set light and tight, like every other heading on the site. The Devanagari
 * gloss is not decoration — "अवसर + सारथी", opportunity and the one who drives
 * you to it, is the whole product in two words, and for most of this audience
 * it is the half of the lockup they can actually read.
 */
export function Logo({
  className,
  showGloss = true,
}: {
  className?: string;
  showGloss?: boolean;
}) {
  return (
    <span className={`flex items-baseline gap-2.5 ${className ?? ""}`}>
      <span className="font-display text-[1.3125rem] font-medium tracking-[-0.03em] text-foreground">
        Avsarathi
      </span>
      {showGloss ? (
        <span className="hidden text-[0.8125rem] text-faint sm:inline">
          अवसारथी
        </span>
      ) : null}
    </span>
  );
}

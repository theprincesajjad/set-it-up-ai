/**
 * The stamp card itself (wave R moment): one printed card-stock object in the shop's colour, with the shop's mark, stamps pressed in ink
 * and the reward. The signature lives here: an earned stamp is the shop's initial pressed in ink, slightly irregular (a rough-edge
 * filter), turned a few degrees per slot (deterministic by index) at about 85% opacity; an unearned slot is a faint dashed circle.
 * Server-rendered SVG and CSS, no script. The shop colour comes from `data-trade` (per-shop colours are data; the trade family's
 * accent has 5.8:1 with white). Sample shop and person from copy.landing.mock.
 */
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

const M = copy.landing.mock;
const C = copy.landing.card;
/**
 * One ink impression of the shop's initial: a ring and the letter, roughened by the shared filter. Each slot turns a few degrees, fixed
 * per position (landing.css, nth-child), so the card renders the same on every visit.
 */
export function InkStamp({ glyph, filter, className }: { glyph: string; filter: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("lp-ink", className)}>
      <g filter={`url(#${filter})`}>
        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3.25" />
        <text x="24" y="33" textAnchor="middle" fontSize="27" fill="currentColor" stroke="currentColor" strokeWidth="0.9" className="lp-ink-glyph">
          {glyph}
        </text>
      </g>
    </svg>
  );
}

/** The rough edge and the ink texture: edge displacement plus a few pinholes where the pad was dry. One per page section that draws stamps. */
export function InkFilter({ id }: { id: string }) {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="s" />
        <feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -30 0 0 0 24" result="holes" />
        <feComposite in="d" in2="holes" operator="in" />
      </filter>
    </svg>
  );
}

/**
 * The card. `earned` of `total` slots are stamped; `fresh` marks the newest one, which presses in once on load (motion allowed: a stamp
 * pressing in at the moment it is earned). Decorative to screen readers except for its label, which says what it shows.
 */
export function StampCard({ earned = 9, total = 10, className, filterId = "lp-ink-card", fresh = true }: { earned?: number; total?: number; className?: string; filterId?: string; fresh?: boolean }) {
  const glyph = M.shop.charAt(0);
  return (
    <figure className={cn("lp-card", className)} data-trade="cafe" role="img" aria-label={C.label}>
      <InkFilter id={filterId} />
      <div className="lp-card-band">
        <span className="lp-card-mark" aria-hidden>
          {glyph}
        </span>
        <span className="lp-card-shop">
          <b>{M.shop}</b>
          <small>{C.street}</small>
        </span>
        <span className="lp-card-count">
          {earned} / {total}
        </span>
      </div>
      <ol className="lp-card-slots" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className={i < earned ? "is-earned" : "is-open"}>
            {i < earned ? <InkStamp glyph={glyph} filter={filterId} className={fresh && i === earned - 1 ? "lp-ink-fresh" : undefined} /> : <span className="lp-slot" />}
          </li>
        ))}
      </ol>
      <div className="lp-card-foot">
        <span>
          <small>{C.rewardLabel}</small>
          <b>{C.reward}</b>
        </span>
        <span className="lp-card-holder">
          <small>{C.holderLabel}</small>
          <b>{C.holder}</b>
        </span>
      </div>
    </figure>
  );
}

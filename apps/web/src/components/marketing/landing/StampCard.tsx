/**
 * The stamp card (wave S): the wallet card a customer carries, drawn in code. A violet band with the shop's mark and name, ten slots
 * (earned ones are sun-yellow stamps with the shop's initial, open ones dashed rings) and the next reward. Server-rendered, no script.
 * The newest stamp presses in once on load when motion is allowed. Sample shop and person from copy.landing.mock and copy.landing.card.
 */
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

const M = copy.landing.mock;
const C = copy.landing.card;

export function StampCard({ earned = 9, total = 10, className, fresh = true }: { earned?: number; total?: number; className?: string; fresh?: boolean }) {
  const glyph = M.shop.charAt(0);
  return (
    <figure className={cn("lp-card", className)} role="img" aria-label={C.label}>
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
          <li key={i} className={i < earned ? (fresh && i === earned - 1 ? "is-earned lp-fresh" : "is-earned") : "is-open"}>
            {i < earned ? glyph : null}
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

/** A friendly phone frame (ink bezel, rounded screen) for a mockup. Decorative chrome only; the content inside carries the label. */
export function Phone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("lp-phone", className)}>
      <div className="lp-phone-screen">
        <span className="lp-phone-notch" aria-hidden />
        {children}
      </div>
    </div>
  );
}

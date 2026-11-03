import { copy } from "@/copy/en-CA";

const T = copy.landing.trades;

/**
 * The trades the product is set up for (wave S: colour chips under the live counts; a looping Marquee in wave Q, a plain line in wave R). Read once,
 * nothing moves. The label names the region for screen readers.
 */
export function TradeMarquee() {
  return (
    <section aria-labelledby="lp-trades" className="lp-trades">
      <span className="lp-trades-label" id="lp-trades">
        {T.label}
      </span>
      <ul>
        {T.items.map((x) => (
          <li key={x.icon}>{x.label}</li>
        ))}
      </ul>
    </section>
  );
}

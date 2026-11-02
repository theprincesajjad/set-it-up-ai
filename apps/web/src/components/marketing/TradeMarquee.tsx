import { Marquee } from "@/components/primitives/marquee";
import { copy } from "@/copy/en-CA";

const T = copy.landing.trades;

/**
 * The trades the product is set up for, as a slow row (kit Marquee, wave Q): server-rendered, CSS-only motion, pauses on hover, stops and
 * scrolls by hand with reduced motion, runs the other way in Urdu. The moving copies are decorative (aria-hidden); the list is read once.
 */
export function TradeMarquee() {
  return (
    <section className="hm-trades" aria-labelledby="hm-trades">
      <p className="hm-trades-label" id="hm-trades">
        {T.label}
      </p>
      <p className="sr-only">{T.items.map((x) => x.label).join(", ")}.</p>
      <Marquee pauseOnHover repeat={3} aria-hidden className="hm-trades-row [--duration:60s] [--gap:12px]">
        {T.items.map((x) => (
          <span key={x.icon} className="hm-trade">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/icons3d/${x.icon}@2x.png`} alt="" width={36} height={36} loading="lazy" decoding="async" />
            {x.label}
          </span>
        ))}
      </Marquee>
    </section>
  );
}

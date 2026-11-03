/**
 * The counter screen in how-it-works (wave S): the one full product view on the page, on a tablet in a friendly frame, in the product's
 * own words with sample people (copy.landing.mock.counter). Find a customer by the last four digits of their phone, and the recent stamps.
 * Decorative to screen readers apart from its label; phones get the recent list only (a dense preview gets simpler, not smaller).
 */
import { copy } from "@/copy/en-CA";

const M = copy.landing.mock;
const C = M.counter;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""];

export function CounterPreview() {
  return (
    <figure className="lp-tablet" role="img" aria-label={copy.landing.how.label}>
      <div className="lp-counter">
        <div className="lp-counter-top" aria-hidden>
          <span className="lp-counter-mark">{M.shop.charAt(0)}</span>
          <b>{M.shop}</b>
          <span className="lp-meta lp-counter-title">{C.title}</span>
          <span className="lp-counter-live">
            <span className="lp-dot" />
            {C.online.replace(/^Online · /, "")}
          </span>
        </div>
        <div className="lp-counter-body" aria-hidden>
          <div className="lp-find">
            <span className="lp-meta">{C.type}</span>
            <span className="lp-digits">
              4 1 6 <i>_</i>
            </span>
            <div className="lp-keys">
              {KEYS.map((k, i) => (
                <span key={i} className={k ? undefined : "invisible"}>
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div className="lp-recent">
            <span className="lp-meta">{C.recent}</span>
            <ol>
              {C.rows.map((r) => (
                <li key={r.who + r.what} className={r.kind === "stamp" ? "is-stamp" : undefined}>
                  <span className="lp-avatar">{r.who.charAt(0)}</span>
                  <b>{r.who}</b>
                  <span>{r.what}</span>
                  <em>{r.n}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </figure>
  );
}

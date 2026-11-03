/**
 * The counter screen in how-it-works (wave R): the one product view on the page, in the product's own words with sample people
 * (copy.landing.mock.counter). Find a customer by the last four digits of their phone, and the recent stamps. Decorative to screen
 * readers apart from its label; phones get the recent list only (a dense preview gets simpler, not smaller).
 */
import { copy } from "@/copy/en-CA";

const M = copy.landing.mock;
const C = M.counter;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""];

export function CounterPreview() {
  return (
    <figure className="lp-counter" role="img" aria-label={copy.landing.how.label}>
      <div className="lp-counter-top" aria-hidden>
        <b>{M.shop}</b>
        <span className="lp-meta">{C.title}</span>
        <span className="lp-meta inline-flex items-center gap-2">
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
                <b>{r.who}</b>
                <span>{r.what}</span>
                <em>{r.n}</em>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}

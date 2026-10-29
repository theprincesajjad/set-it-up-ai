import { copy } from "@/copy/en-CA";
import type { SoloKey } from "@/lib/marketing/solo";
import type { SoloView } from "@/lib/marketing/solo-view";
import { Arrow, Check } from "./parts";
import { SourceField } from "./SourceField";

const S = copy.solo.start;
const TRADES: SoloKey[] = ["nails", "brows", "lashes", "makeup", "barber", "groom"];

/**
 * Block 7: name, trade and email or mobile, then the existing sign-up (the wizard asks the rest: where you work, the password).
 * A plain GET form to /signup, so it works before any script loads; signupPrefill turns ?shop, ?trade and ?contact into the
 * wizard's starting values. The trade chips are native radios.
 */
export function Start({ v }: { v: SoloView }) {
  return (
    <section className="sl-sec sl-sec-white" id="start" aria-labelledby="sl-start">
      <div className="sl-wrap sl-start-grid">
        <div className="sl-head">
          <p className="sl-eyebrow">{S.eyebrow}</p>
          <h2 className="sl-d2" id="sl-start">
            {S.title}
          </h2>
          <ul className="sl-ready">
            {S.ready.map((r) => (
              <li key={r.b}>
                <Check />
                <span>
                  <b>{r.b}</b> {r.rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <form className="sl-form" action="/signup" method="get" data-src={v.src}>
          <SourceField fallback={v.src} />
          <label>
            {S.name}
            <input type="text" name="shop" required maxLength={120} autoComplete="organization" />
          </label>
          <fieldset>
            <legend>{S.trade}</legend>
            <div className="sl-trades">
              {TRADES.map((t) => (
                <label key={t} className="sl-chip-r">
                  <input type="radio" name="trade" value={t} defaultChecked={t === v.key} />
                  {S.trades[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {S.contact}
            <input type="text" name="contact" required maxLength={254} autoComplete="email" inputMode="email" aria-describedby="sl-contact-hint" />
            <span className="hint" id="sl-contact-hint">
              {S.contactHint}
            </span>
          </label>
          <button className="sl-btn" type="submit">
            {S.cta}
            <Arrow />
          </button>
          <p className="sl-fine">{S.fine}</p>
          <a className="sl-full" href={v.signupHref}>
            {copy.solo.fullPage}
          </a>
        </form>
      </div>
    </section>
  );
}

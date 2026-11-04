import { QrCode } from "@/components/ui/QrCode";
import { copy } from "@/copy/en-CA";
import { Emph } from "@/lib/marketing/emphasis";
import { tryColours, tryTrades } from "@/lib/marketing/try-card";
import { Phone } from "./Product";
import { TryControls, TryCta, TryNotice, TryPass, TryProvider, TryReady, type TryTradeData } from "./TryCard";

const T = copy.landing.tryIt;
const P = copy.landing.product;

/**
 * "Make your card right here" (wave V), right under the hero: the card maker on the grey band. The controls and the pass are the client
 * island (TryCard.tsx); the heading, the phone around the pass and the member QR are server-rendered here, and the trade data comes
 * from lib/marketing/try-card.ts (the signup's own templates and colours). Phones: the card sits above the fields, cut off at the
 * phone's middle, so it stays in sight while the owner types. id="try" is what the hero button and the shop tiles link to.
 */
export function TrySection() {
  const trades: TryTradeData[] = tryTrades().map((t) => ({ ...t, label: T.trades[t.key] }));
  const colours = tryColours().map((c, i) => ({ ...c, name: T.colours[i] ?? c.base }));
  return (
    <section className="lp-try" id="try" aria-labelledby="lp-try">
      <TryProvider trades={trades} colours={colours} copy={{ ...T, note: copy.landing.reassure }}>
        <div className="lp-wrap lp-try-grid">
          <div className="lp-try-head">
            <p className="lp-eyebrow">{T.eyebrow}</p>
            <h2 className="lp-h2" id="lp-try">
              <Emph text={T.title} />
            </h2>
            <p className="lp-lede">{T.sub}</p>
          </div>
          <div className="lp-try-side">
            <TryControls />
            <TryCta />
          </div>
          <div className="lp-try-art">
            <Phone tone="wallet" className="lp-try-phone">
              <div className="wu-wallet">
                <div className="wu-wallet-top" aria-hidden>
                  <span className="wu-wallet-done">{P.done}</span>
                  <span className="wu-wallet-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <TryPass qr={<QrCode value="https://localloyalty.ca/c/44712208" size={120} ecc="L" label={T.pass.code} />} />
                <TryNotice />
                <TryReady />
              </div>
            </Phone>
            <p className="lp-caption lp-try-caption">{T.phoneNote}</p>
          </div>
        </div>
      </TryProvider>
    </section>
  );
}

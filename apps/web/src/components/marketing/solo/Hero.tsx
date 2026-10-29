import { copy } from "@/copy/en-CA";
import type { SoloView } from "@/lib/marketing/solo-view";
import { Arrow, Check, Obj, Photo, n } from "./parts";

const H = copy.solo.hero;

/** Hero photo slots: the work photo is 300 px wide beside the phone and 112 px above it on phones; the phone's cover is about 280. */
export const WORK_SIZES = "(min-width: 572px) 300px, 112px";
export const COVER_SIZES = "290px";

/**
 * Block 1: the hook on the start side, and on the end side the client's booking page on a big phone running the four-screen flow
 * (pick, time, details, booked: no deposit in the default story; the details screen says deposits are each pro's option) with the
 * three moments beside it (the DM, the new booking, the reminder). The stage is one picture for assistive tech (role="img").
 */
export function Hero({ v }: { v: SoloView }) {
  const [s1, s2, s3] = v.services;
  const initial = v.trade.studio[0];
  const T = v.trade;
  return (
    <section className="sl-hero" aria-labelledby="sl-hook">
      <div className="sl-wrap sl-hero-grid">
        <div className="sl-copy">
          <p className="sl-eyebrow sl-rise">{v.hero.eyebrow}</p>
          <h1 className="sl-h1" id="sl-hook">
            <span>{v.hero.hook[0]}</span>{" "}
            <span className="sl-i1">
              <em>{v.hero.hook[1]}</em>
            </span>
          </h1>
          <p className="sl-lede sl-rise sl-i2">{v.hero.lede}</p>
          <div className="sl-ctas sl-rise sl-i3">
            <a className="sl-btn" href="#start" data-cta="hero">
              {v.hero.cta}
              <Arrow />
            </a>
            <a className="sl-price-link" href="#plans">
              {v.hero.price}
              <span aria-hidden>·</span>
              <u>{H.priceLink}</u>
            </a>
          </div>
          <p className="sl-proof sl-rise sl-i3">{H.proof}</p>
          <ul className="sl-trust sl-rise sl-i4">
            {v.hero.trust.map((x) => (
              <li key={x}>
                <Check />
                {x}
              </li>
            ))}
          </ul>
        </div>

        <div className="sl-stage">
          <div className="sl-stage-in" role="img" aria-label={H.stageLabel}>
            <div className="sl-lead">
              <div className="sl-work">
                <Photo photo={v.photos.work} sizes={WORK_SIZES} priority />
              </div>
              <div className="sl-float sl-dm glass-sheet">
                <p className="sl-bubble">{T.dm}</p>
              </div>
            </div>
            <div className="sl-float sl-dep glass-sheet">
              <span className="ic">
                <Obj name="first_booking" />
              </span>
              <div>
                <b>{v.hero.bookedCard}</b>
                <small>{v.hero.bookedCardLine}</small>
              </div>
            </div>
            <div className="sl-float sl-rem glass-sheet">
              <span className="ic">
                <Obj name="bell" />
              </span>
              <div>
                <b>{H.reminderCard}</b>
                <small>{H.reminderCardLine}</small>
              </div>
            </div>

            <div className="sl-phone">
              <div className="sl-screen">
                <span className="sl-island" />
                {/* 1. Pick a service */}
                <div className={`sl-app ${n(0)}`}>
                  <div className="sl-cover">
                    <Photo photo={v.photos.cover} sizes={COVER_SIZES} eager />
                  </div>
                  <div className="sl-who">
                    <span className="sl-avatar">{initial}</span>
                    <div>
                      <b>{T.studio}</b>
                      <small>{T.area}</small>
                    </div>
                  </div>
                  {[s1!, s2!, s3!].map((s) => (
                    <div key={s.name} className={s === s2 ? "sl-row on" : "sl-row"}>
                      <div>
                        <b>{s.name}</b>
                        <small>{s.minutes}</small>
                      </div>
                      <span className="price num">{s.price}</span>
                    </div>
                  ))}
                  <div className="sl-cta">{H.pickTime}</div>
                </div>
                {/* 2. Pick a time */}
                <div className={`sl-app ${n(1)}`}>
                  <div className="sl-who">
                    <span className="sl-avatar">{initial}</span>
                    <div>
                      <b>{T.studio}</b>
                      <small>
                        {s2!.name} · {s2!.minutes}
                      </small>
                    </div>
                  </div>
                  {H.days.map((d, di) => (
                    <div key={d} className="contents">
                      <div className="sl-hd">
                        {d} <small>{H.open.replace("{n}", String(H.slots[di]!.length))}</small>
                      </div>
                      <div className="sl-slots">
                        {H.slots[di]!.map((t) => (
                          <span key={t} className={di === 0 && t === H.picked ? "sl-slot on" : "sl-slot"}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="sl-policy">
                    <b>{v.hero.policy.title}</b>
                    {v.hero.policy.body}
                  </div>
                  <div className="sl-cta">{H.next}</div>
                </div>
                {/* 3. Details: no deposit in the default story; deposits are each pro's option */}
                <div className={`sl-app ${n(2)}`}>
                  <div className="sl-who">
                    <span className="sl-avatar">{initial}</span>
                    <div>
                      <b>{T.studio}</b>
                      <small>{H.when}</small>
                    </div>
                  </div>
                  <div className="sl-hd">{H.details}</div>
                  <div className="sl-row">
                    <div>
                      <small>{H.nameLabel}</small>
                      <b>{T.client}</b>
                    </div>
                  </div>
                  <div className="sl-row">
                    <div>
                      <small>{H.phoneLabel}</small>
                      <b className="num">{H.phone}</b>
                    </div>
                  </div>
                  <div className="sl-pay">
                    <div className="l">
                      <span>{s2!.name}</span>
                      <b className="num">{s2!.price}</b>
                    </div>
                    <div className="l">
                      <span>{H.payLater}</span>
                    </div>
                    <div className="l opt">
                      <span>{H.depositRow}</span>
                      <span className="sl-chip">{H.depositNone}</span>
                    </div>
                    <p className="sl-optnote">{H.depositNote}</p>
                    <div className="sl-cta">{H.book}</div>
                  </div>
                </div>
                {/* 4. Booked */}
                <div className={`sl-app ${n(3)}`}>
                  <div className="sl-done">
                    <span className="sl-tick">
                      <Check width={3.5} />
                    </span>
                    <h4>{v.hero.booked}</h4>
                    <p>
                      {s2!.name} · {H.bookedWhen}
                      <br />
                      {H.bookedLine}
                    </p>
                    <span className="sl-wallet">{H.wallet}</span>
                  </div>
                </div>
              </div>
            </div>
            <ul className="sl-steps">
              {H.steps.map((s, i) => (
                <li key={s} className={n(i)}>
                  <i />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

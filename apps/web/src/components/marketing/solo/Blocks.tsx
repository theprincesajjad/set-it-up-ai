import Link from "next/link";
import type { CSSProperties } from "react";
import { copy } from "@/copy/en-CA";
import type { JobId } from "@/lib/marketing/landing-variants";
import type { SoloView } from "@/lib/marketing/solo-view";
import { Arrow, Check, Mark, Obj, Photo, Plus, n } from "./parts";

const C = copy.solo;

/** The calendar demo: which slots are booked (day, row), the order they fill in, and where each came from (0 link, 1 DM, 2 added). */
const WEEK: [number, number, number, 0 | 1 | 2][] = [
  [1, 0, 1, 0], [2, 1, 4, 0], [3, 0, 2, 1], [3, 1, 6, 0], [4, 0, 0, 0], [4, 1, 3, 2], [4, 2, 7, 0], [5, 0, 5, 1], [5, 1, 8, 0], [5, 2, 9, 0], [6, 0, 10, 2],
];

/** A number that counts up (CSS only, solo.css `.sl-n`); the text is what shows with reduced motion and to assistive tech. */
function Count({ to, prefix = "" }: { to: number; prefix?: string }) {
  return (
    <b className="sl-n num" style={{ "--to": to } as CSSProperties}>
      {prefix}
      <span>{to}</span>
    </b>
  );
}

/**
 * Calls to action between the blocks (landing v4): the primary button to the start form and a quiet link to the prices. `id` is the
 * beacon's name for the button (data-cta, lower-case letters, 10 at most: the API drops anything else).
 */
export function CtaRow({ id, center }: { id: string; center?: boolean }) {
  return (
    <div className={center ? "sl-ctarow sl-center" : "sl-ctarow"}>
      <a className="sl-btn" href="#start" data-cta={id}>
        {C.cta.primary}
        <Arrow />
      </a>
      <a className="sl-link" href="#plans" data-cta="seepricing">
        {C.cta.pricing}
      </a>
    </div>
  );
}

/** The band before the prices: one line, one button. */
export function CtaBand() {
  return (
    <section className="sl-band" aria-labelledby="sl-band">
      <div className="sl-wrap sl-band-in">
        <div>
          <h2 className="sl-d3" id="sl-band">
            {C.cta.band.title}
          </h2>
          <p>{C.cta.band.sub}</p>
        </div>
        <a className="sl-btn sl-btn-inv" href="#start" data-cta="prepricing">
          {C.cta.primary}
          <Arrow />
        </a>
      </div>
    </section>
  );
}

/** Phones only: a bar pinned to the bottom with the primary button and the prices (CSS hides it at the top and at the form). */
export function StickyCta() {
  return (
    <div className="sl-sticky">
      <a className="sl-btn" href="#start" data-cta="sticky">
        {C.cta.primary}
      </a>
      <a className="sl-btn2" href="#plans" data-cta="seepricing">
        {C.cta.pricing}
      </a>
    </div>
  );
}

/** Right under the hero: four numbers a pro can check, and the button. */
export function Facts({ v }: { v: SoloView }) {
  return (
    <section className="sl-facts" aria-label={C.facts.label}>
      <div className="sl-wrap sl-facts-in">
        <ul>
          {v.facts.map((x) => (
            <li key={x.value}>
              <b className="num">{x.value}</b>
              <span>{x.line}</span>
            </li>
          ))}
        </ul>
        <a className="sl-btn" href="#start" data-cta="afterhero">
          {C.cta.primary}
          <Arrow />
        </a>
      </div>
    </section>
  );
}

/** Block 2, the wow moment: the owner's week. Numbers count up, the bars grow, the best day is in the trade colour. */
export function Week({ v }: { v: SoloView }) {
  const W = v.week;
  const bars: readonly number[] = W.bars;
  const max = Math.max(...bars);
  const best = bars.indexOf(max);
  return (
    <section className="sl-sec" id="week" aria-labelledby="sl-week">
      <div className="sl-wrap">
        <div className="sl-head sl-center">
          <h2 className="sl-d2" id="sl-week">
            {W.title}
          </h2>
          <p className="sl-lede">{W.sub}</p>
        </div>
        <figure className="sl-dash card-clear" aria-label={W.label}>
          <div className="sl-dash-h">
            <b>{W.thisWeek}</b>
            <span className="sl-chip up">{W.vsLast}</span>
          </div>
          <div className="sl-stats" aria-hidden>
            {W.stats.map((s, i) => (
              <div key={s.label} className={`sl-stat ${n(i)}`}>
                <Count to={s.n} />
                <span>{s.label}</span>
                {s.chip ? <small className="sl-chip up">{s.chip}</small> : null}
              </div>
            ))}
          </div>
          <div className="sl-dash-grid" aria-hidden>
            <div className="sl-chart">
              <div className="sl-bars">
                {bars.map((h, i) => (
                  <span key={i} className={`${n(i)} ${i === best ? "best" : ""}`}>
                    <i style={{ "--h": h / max } as CSSProperties} />
                    <small>{W.days[i]}</small>
                  </span>
                ))}
              </div>
              <div className="sl-best">
                <small>{W.bestDay}</small>
                <b>{W.bestDayValue}</b>
              </div>
            </div>
            <div className="sl-next">
              <small>{W.upNext.label}</small>
              <div className="sl-dr">
                <span className="sl-avatar">{W.upNext.who[0]}</span>
                <div>
                  <b>{W.upNext.who}</b>
                  <small>
                    {W.upNext.what} · {W.upNext.when}
                  </small>
                </div>
                <span className="sl-chip trade">{C.hero.bookedWhen.split(" ")[0]}</span>
              </div>
              <div className="sl-dr sl-n1">
                <span className="sl-avatar">{v.trade.people[1]![0]}</span>
                <div>
                  <b>{v.trade.people[1]}</b>
                  <small>
                    {v.services[0]!.name} · {C.regulars.times[1]}
                  </small>
                </div>
              </div>
            </div>
          </div>
          <figcaption className="sl-note">{W.sample}</figcaption>
        </figure>
        <CtaRow id="week" center />
      </div>
    </section>
  );
}

/** Block 3: every booking lands on one calendar, from the link, from a DM, or added by the owner. */
export function Bookings({ v }: { v: SoloView }) {
  const B = v.bookings;
  const T = v.trade;
  return (
    <section className="sl-sec sl-sec-white" id="bookings" aria-labelledby="sl-bookings">
      <div className="sl-wrap sl-two">
        <div className="sl-head">
          <h2 className="sl-d2" id="sl-bookings">
            {B.title}
          </h2>
          <p className="sl-lede">{B.sub}</p>
          <ul className="sl-sources">
            {B.sources.map((s, i) => (
              <li key={s} className={`s${i}`}>
                <i />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="sl-cal-stack">
          <figure className="sl-cal card-clear" aria-label={B.label}>
            <div className="sl-week" aria-hidden>
              {B.week.map((d, di) => (
                <div key={d}>
                  <span className="sl-day">
                    {d}
                    <b className="num">{di + 2}</b>
                  </span>
                  {[0, 1, 2].map((r) => {
                    const hit = WEEK.find(([wd, wr]) => wd === di && wr === r);
                    return <i key={r} className={hit ? `b s${hit[3]} ${n(hit[2])}` : undefined} />;
                  })}
                </div>
              ))}
            </div>
            <div className="sl-weeknote">
              <Obj name="first_booking" />
              <div>
                {B.weekBooked}
                <small>{B.weekLine}</small>
              </div>
            </div>
          </figure>
          <figure className="sl-dm-card card-clear" aria-label={B.inboxLabel}>
            <div className="sl-msg">
              <span className="sl-ig" aria-hidden>
                {T.handle[0]!.toUpperCase()}
                <Obj name="instagram_mark" size={18} />
              </span>
              <div>
                <b>
                  {T.handle} <small>{B.time}</small>
                </b>
                <span>{T.dm}</span>
              </div>
            </div>
            <div className="sl-dm-row" aria-hidden>
              <span className="sl-act">
                <Plus />
                {B.action}
              </span>
              <span className="sl-dm-done">
                <Check />
                <span>
                  <b>{B.done}</b>
                  <small>{B.doneLine}</small>
                </span>
              </span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

/** Block 4: a promo in one tap: pick a seasonal template, send it to the regulars who opted in, watch the bookings land. */
export function Promos({ v }: { v: SoloView }) {
  const P = v.promos;
  const T = v.trade;
  return (
    <section className="sl-sec" id="promos" aria-labelledby="sl-promos">
      <div className="sl-wrap">
        <div className="sl-head sl-center">
          <h2 className="sl-d2" id="sl-promos">
            {P.title}
          </h2>
          <p className="sl-lede">{P.sub}</p>
        </div>
        <figure className="sl-flow" aria-label={P.label}>
          <div className="sl-step card-clear sl-n0">
            <span className="sl-stepn">
              <b>1</b>
              {P.steps[0]}
            </span>
            <div className="sl-tpl" aria-hidden>
              <div className="on">
                <Obj name="megaphone" size={30} />
                {T.promo}
              </div>
              {P.templates.map((x, i) => (
                <div key={x}>
                  <Obj name={["calendar_week", "regulars", "price_tag"][i]!} size={30} />
                  {x}
                </div>
              ))}
            </div>
          </div>
          <div className="sl-step card-clear sl-n1">
            <span className="sl-stepn">
              <b>2</b>
              {P.steps[1]}
            </span>
            <div className="sl-send" aria-hidden>
              <div>
                {T.sent}
                <small>{P.sendNote}</small>
              </div>
              <span>{P.send}</span>
            </div>
            <p className="sl-note">{P.allowance}</p>
          </div>
          <div className="sl-step card-clear sl-n2 sl-step-result">
            <span className="sl-stepn">
              <b>3</b>
              {P.steps[2]}
            </span>
            <p className="sl-result" aria-hidden>
              <Count to={9} prefix="+" />
              <span>{P.result}</span>
            </p>
          </div>
        </figure>
        <CtaRow id="promos" center />
      </div>
    </section>
  );
}

/** Block 5: the stamp card over a photo of the work, and who came back this month. */
export function Regulars({ v }: { v: SoloView }) {
  const R = C.regulars;
  const T = v.trade;
  const P = T.people;
  // One visit to go: every stamp but the last is on, and the newest one fills in.
  const stamps = Array.from({ length: v.goal }, (_, i) => i);
  const have = v.goal - 1;
  return (
    <section className="sl-sec sl-sec-white" id="regulars" aria-labelledby="sl-reg">
      <div className="sl-wrap">
        <div className="sl-head">
          <h2 className="sl-d2" id="sl-reg">
            {R.title}
          </h2>
          <p className="sl-lede">{R.sub}</p>
        </div>
        <div className="sl-reg">
          <div className="sl-pass-wrap">
            <Photo photo={v.photos.band} sizes="(min-width: 900px) 590px, 100vw" />
            <div className="sl-pass glass-sheet" aria-hidden>
              <div className="t">
                <div>
                  <b>{T.studio}</b>
                  <small>{v.card}</small>
                </div>
                <Mark />
              </div>
              <div className={`sl-stamps c${v.goal}`}>
                {stamps.map((i) => (
                  <i key={i} className={i < have ? (i === have - 1 ? "on fresh" : "on") : undefined}>
                    <Check width={3.5} />
                  </i>
                ))}
              </div>
              <div className="next">
                {R.more} <span>{T.reward}</span>
              </div>
              <div className="big">
                <Obj name="stamp_card" />
                {R.stamped}
              </div>
            </div>
          </div>
          <div className="sl-back card-clear" aria-hidden>
            <div className="sl-sum">
              <small>{R.backLabel}</small>
              <b className="num">{R.backTotal}</b>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={P[i]} className={`sl-dr ${n(i)}`}>
                <span className="sl-avatar">{P[i]![0]}</span>
                <div>
                  <b>
                    {P[i]} · {v.services[[1, 0, 2][i]!]!.name}
                  </b>
                  <small>{R.times[i]}</small>
                </div>
                <span className={i === 0 ? "sl-chip trade" : "sl-chip up"}>{R.chips[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Block 6: the variant's three jobs as three compact UI cards (the demos are pictures: aria-hidden). */
export function Jobs({ v }: { v: SoloView }) {
  const J = C.jobs;
  const P = v.trade.people;
  const [s1, s2, s3] = v.services;
  const demo: Record<JobId, React.ReactNode> = {
    book: (
      <div className="sl-demo sl-deps" aria-hidden>
        <p className="sl-demo-h">{J.pickTitle}</p>
        {[s1!, s2!, s3!].map((s, i) => (
          <div key={s.name} className={`sl-dr ${n(i)} ${s === s2 ? "on" : ""}`}>
            <div>
              <b>{s.name}</b>
              <small>{s.minutes}</small>
            </div>
            <span className="sl-chip num">{s.price}</span>
          </div>
        ))}
        <span className="sl-save sl-n3">{C.hero.pickTime}</span>
      </div>
    ),
    remind: (
      <div className="sl-demo" aria-hidden>
        <div className="sl-lock">
          <div className="sl-clock">
            <small>{J.lockDate}</small>
            {J.lockTime}
          </div>
          {v.notes.map((x, i) => (
            <div key={x} className={`sl-notif ${n(i)}`}>
              <Mark />
              <div>
                <b>
                  {v.trade.studio}
                  <small>{[J.now, J.before, J.later][i]}</small>
                </b>
                <span>{x}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    noshow: (
      <div className="sl-demo sl-deps" aria-hidden>
        <p className="sl-demo-h">{J.noshowLabel}</p>
        {J.noshowRows.map((r, i) => (
          <div key={r} className={`sl-dr ${n(i)}`}>
            <div>
              <b>{r}</b>
            </div>
            <span className={i === 0 ? "sl-switch on" : "sl-switch"}>{i === 0 ? J.on : J.off}</span>
          </div>
        ))}
        <p className="sl-note">{J.noshowNote}</p>
      </div>
    ),
    yours: (
      <div className="sl-demo sl-deps" aria-hidden>
        <div className="sl-sum">
          <small>{J.yoursLabel}</small>
          <b className="num">{J.yoursTotal}</b>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={P[i]} className={`sl-dr ${n(i)}`}>
            <span className="sl-avatar">{P[i]![0]}</span>
            <div>
              <b>{P[i]}</b>
              <small>{v.services[[1, 0, 2][i]!]!.name}</small>
            </div>
            <span className={i === 0 ? "sl-chip up" : "sl-chip"}>{J.yoursChips[i]}</span>
          </div>
        ))}
      </div>
    ),
    private: (
      <div className="sl-demo sl-deps" aria-hidden>
        <div className="sl-dr">
          <Obj name="pin_area" />
          <div>
            <small>{J.privateBefore}</small>
            <b>{v.trade.area}</b>
          </div>
        </div>
        <div className="sl-dr sl-n1">
          <Obj name="home_studio" />
          <div>
            <small>{J.privateAfter}</small>
            <b>{J.privateAddress}</b>
          </div>
          <span className="sl-chip up">{v.trade.client}</span>
        </div>
      </div>
    ),
    line: (
      <div className="sl-demo sl-deps" aria-hidden>
        <div className="sl-sum">
          <small>{J.lineLabel}</small>
          <b className="num">{J.linePlace}</b>
          <small>{J.lineWait}</small>
        </div>
        {J.lineRows.map(([who, when], i) => (
          <div key={who} className={`sl-dr ${n(i)}`}>
            <span className="sl-avatar">{i + 1}</span>
            <div>
              <b>{who}</b>
              <small>{when}</small>
            </div>
          </div>
        ))}
      </div>
    ),
    regulars: (
      <div className="sl-demo sl-deps" aria-hidden>
        <div className="sl-sum">
          <small>{C.regulars.backLabel}</small>
          <b className="num">{C.regulars.backTotal}</b>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={P[i]} className={`sl-dr ${n(i)}`}>
            <span className="sl-avatar">{P[i]![0]}</span>
            <div>
              <b>{P[i]}</b>
              <small>{C.regulars.times[i]}</small>
            </div>
            <span className={i === 0 ? "sl-chip trade" : "sl-chip up"}>{C.regulars.chips[i]}</span>
          </div>
        ))}
      </div>
    ),
  };
  return (
    <section className="sl-sec" id="jobs" aria-labelledby="sl-jobs">
      <div className="sl-wrap">
        <div className="sl-head">
          <h2 className="sl-d2" id="sl-jobs">
            {J.title}
          </h2>
        </div>
        <div className="sl-jobs">
          {v.jobs.map((j) => (
            <article key={j.id} className="sl-job card-clear" data-job={j.id}>
              <div>
                <h3>{j.title}</h3>
                <p>{j.body}</p>
              </div>
              {demo[j.id]}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The prices: two cards from lib/marketing/plan-copy.ts (words) and PLANS (numbers); the comparison lives on /pricing. */
export function PriceBlock({ v }: { v: SoloView }) {
  return (
    <section className="sl-sec sl-sec-white" id="plans" aria-labelledby="sl-plans">
      <div className="sl-wrap">
        <div className="sl-head sl-center">
          <h2 className="sl-d2" id="sl-plans">
            {v.price.title}
          </h2>
          <p className="sl-lede">{v.price.sub}</p>
        </div>
        <div className="sl-plans">
          {v.price.plans.map((p) => (
            <div key={p.key} data-plan={p.key} className={p.key === "monthly" ? "sl-plan featured" : "sl-plan card-clear"}>
              <div className="sl-plan-h">
                <span className="name">{p.name}</span>
                {p.badge ? <span className="sl-badge">{p.badge}</span> : null}
              </div>
              <span className="price num">
                {p.price}
                {p.per ? <small>{p.per}</small> : null}
              </span>
              {p.yearly ? (
                <span className="yearly" data-plan="yearly">
                  {p.yearly.line}
                </span>
              ) : null}
              <span className="what">{p.tagline}</span>
              <ul>
                {p.features.map((x) => (
                  <li key={x}>
                    <Check />
                    {x}
                  </li>
                ))}
              </ul>
              {p.yearly?.extra ? <span className="sl-note">{p.yearly.extra}</span> : null}
              <a className={p.key === "monthly" ? "sl-btn sl-btn-inv" : "sl-btn"} href="#start" data-cta="plans">
                {p.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="sl-plans-note">
          <span>{v.price.note}</span>
          <Link href="/pricing#booking-apps" prefetch={false}>
            {C.price.compare}
          </Link>
        </p>
      </div>
    </section>
  );
}

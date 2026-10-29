import Link from "next/link";
import { copy } from "@/copy/en-CA";
import type { JobId } from "@/lib/marketing/landing-variants";
import type { SoloView } from "@/lib/marketing/solo-view";
import { Check, Mark, Obj, Photo, Plus, n } from "./parts";

const C = copy.solo;

/** The week demo: which slots are booked (day, row) and the order they fill in. */
const WEEK: [number, number, number][] = [
  [1, 0, 1], [2, 1, 4], [3, 0, 2], [3, 1, 6], [4, 0, 0], [4, 1, 3], [4, 2, 7], [5, 0, 5], [5, 1, 8], [5, 2, 9], [6, 0, 10],
];

/** Block 2: four facts a tech can check. */
export function Facts({ v }: { v: SoloView }) {
  return (
    <section className="sl-facts" aria-label={C.facts.label}>
      <div className="sl-wrap">
        <ul>
          {v.facts.map((x) => (
            <li key={x.value} className="card-clear">
              <b className="num">{x.value}</b>
              <span>{x.line}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Block 3: three jobs as three live UI cards, in the variant's order (the demos are pictures: aria-hidden). */
export function Jobs({ v }: { v: SoloView }) {
  const J = C.jobs;
  const P = v.trade.people;
  const demo: Record<JobId, React.ReactNode> = {
    book: (
      <div className="sl-demo sl-week" aria-hidden>
        {J.week.map((d, di) => (
          <div key={d}>
            <span className="sl-day">
              {d}
              <b className="num">{di + 2}</b>
            </span>
            {[0, 1, 2].map((r) => {
              const hit = WEEK.find(([wd, wr]) => wd === di && wr === r);
              return <i key={r} className={hit ? `b ${n(hit[2])}` : undefined} />;
            })}
          </div>
        ))}
        <div className="sl-weeknote">
          <Obj name="first_booking" />
          <div>
            {J.weekBooked}
            <small>{J.weekLine}</small>
          </div>
        </div>
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
    regulars: (
      <div className="sl-demo sl-deps" aria-hidden>
        <div className="sl-sum">
          <small>{J.regularsLabel}</small>
          <b className="num">{J.regularsTotal}</b>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={P[i]} className={`sl-dr ${n(i)}`}>
            <span className="sl-avatar">{P[i]![0]}</span>
            <div>
              <b>
                {P[i]} · {v.services[[1, 0, 2][i]!]!.name}
              </b>
              <small>{J.times[i]}</small>
            </div>
            <span className={i === 0 ? "sl-chip trade" : "sl-chip up"}>{J.chips[i]}</span>
          </div>
        ))}
      </div>
    ),
  };
  return (
    <section className="sl-sec" id="jobs" aria-labelledby="sl-jobs">
      <div className="sl-wrap">
        <div className="sl-head">
          <p className="sl-eyebrow">{J.eyebrow}</p>
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

/** Block 4: the DM she gets every night becomes a booking ("Create booking from message", solo-pro-launch.md 6.3). */
export function DmToBooking({ v }: { v: SoloView }) {
  const D = C.dm;
  const T = v.trade;
  return (
    <section className="sl-sec sl-sec-white" aria-labelledby="sl-dm">
      <div className="sl-wrap">
        <div className="sl-head">
          <p className="sl-eyebrow">{D.eyebrow}</p>
          <h2 className="sl-d2" id="sl-dm">
            {D.title}
          </h2>
          <p className="sl-lede">{D.sub}</p>
        </div>
        <div className="sl-inbox">
          <figure className="sl-pane" aria-label={D.inboxLabel}>
            <div className="sl-pane-h">
              <span>{D.inbox}</span>
              <span className="sl-chip info">{D.inboxChip}</span>
            </div>
            <div className="sl-msg sel">
              <span className="sl-ig" aria-hidden>
                {T.handle[0]!.toUpperCase()}
                <Obj name="instagram_mark" size={18} />
              </span>
              <div>
                <b>
                  {T.handle} <small>{D.time}</small>
                </b>
                <span>{T.dm}</span>
                <span className="sl-act" aria-hidden>
                  <Plus />
                  {D.action}
                </span>
              </div>
            </div>
            {T.others.map((m) => (
              <div key={m.handle} className="sl-msg">
                <span className="sl-ig" aria-hidden>
                  {m.handle[0]!.toUpperCase()}
                  <Obj name="instagram_mark" size={18} />
                </span>
                <div>
                  <b>
                    {m.handle} <small>{m.time}</small>
                  </b>
                  <span>{m.text}</span>
                </div>
              </div>
            ))}
          </figure>
          <figure className="sl-sheet" aria-label={D.sheetLabel}>
            <h4>
              {D.sheet} <span className="sl-chip trade">{D.fromIg}</span>
            </h4>
            <div className="sl-field">
              {D.client}
              <div>
                <span className="sl-avatar" aria-hidden>
                  {T.client[0]}
                </span>
                {T.client} · @{T.handle}
                <span className="sl-chip">{D.regular}</span>
              </div>
            </div>
            <div className="sl-field">
              {D.service}
              <div>
                {v.booked.name}
                <span className="sl-chip">{v.booked.price}</span>
              </div>
            </div>
            <div className="sl-field">
              {D.when}
              <div>{C.hero.when}</div>
            </div>
            <div className="sl-field">
              {D.note}
              <div className="quote">{T.dm}</div>
            </div>
            <span className="sl-save" aria-hidden>
              {D.save}
            </span>
            <p className="sl-note">{v.dmAfter}</p>
          </figure>
        </div>
      </div>
    </section>
  );
}

/** Block 5: the stamp card over a photo of the work, and a promo to every regular in one tap. */
export function Regulars({ v }: { v: SoloView }) {
  const R = C.regulars;
  const T = v.trade;
  // One visit to go: every stamp but the last is on, and the newest one fills in.
  const stamps = Array.from({ length: v.goal }, (_, i) => i);
  const have = v.goal - 1;
  return (
    <section className="sl-sec" aria-labelledby="sl-reg">
      <div className="sl-wrap">
        <div className="sl-head">
          <p className="sl-eyebrow">{R.eyebrow}</p>
          <h2 className="sl-d2" id="sl-reg">
            {R.title}
          </h2>
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
          <div className="sl-promo card-clear">
            <h3>{R.promoTitle}</h3>
            <p>{v.promoSub}</p>
            <div className="sl-tpl" aria-hidden>
              <div className="on">
                <Obj name="megaphone" size={30} />
                {T.promo}
              </div>
              {R.templates.map((x, i) => (
                <div key={x}>
                  <Obj name={["calendar_week", "regulars", "price_tag"][i]!} size={30} />
                  {x}
                </div>
              ))}
            </div>
            <div className="sl-send" aria-hidden>
              <div>
                {T.sent}
                <small>{R.sendNote}</small>
              </div>
              <span>{R.send}</span>
            </div>
            <p className="sl-result">
              <b className="num">{R.resultN}</b>
              {R.result}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Block 6: three numbers, one line each, read from PLANS; the comparison lives on /pricing. */
export function PriceBlock({ v }: { v: SoloView }) {
  return (
    <section className="sl-sec" id="plans" aria-labelledby="sl-plans">
      <div className="sl-wrap">
        <div className="sl-head">
          <p className="sl-eyebrow">{C.price.eyebrow}</p>
          <h2 className="sl-d2" id="sl-plans">
            {v.price.title}
          </h2>
        </div>
        <div className="sl-plans">
          {v.price.plans.map((p) => (
            <div key={p.key} data-plan={p.key} className={p.key === "monthly" ? "sl-plan featured" : "sl-plan card-clear"}>
              <span className="name">{p.name}</span>
              <span className="price num">
                {p.price}
                {p.per ? <small>{p.per}</small> : null}
              </span>
              <span className="what">{p.what}</span>
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

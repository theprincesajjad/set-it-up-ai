import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { COMPETITORS, formatAsOf } from "@/lib/marketing/sources";

export { COMPETITORS } from "@/lib/marketing/sources";

/**
 * "How we compare" on the home page: us against named, dated competitors, each cell read from the vendor's public pricing page. The
 * plans themselves are the home page's price columns (lib/marketing/plan-copy.ts). Every row of COMPETITORS carries `asOf` and
 * `sourceUrl`; a unit test fails when one is older than 90 days.
 * Wave S: the table sits in a white rounded card with our column on a mint tint; phones get one small card per row. Styles are the
 * home page's (landing.css).
 */
export function CompetitorTable() {
  const c = copy.landing.compare;
  const oldest = COMPETITORS.map((x) => x.asOf).sort()[0]!;
  const notes = [...new Set(COMPETITORS.map((x) => x.currencyNote).filter(Boolean))];
  const get = (x: (typeof COMPETITORS)[number], row: number) => [x.monthlyFee, x.locations, x.salesFee][row]!;
  return (
    <section className="lp-sec" aria-labelledby="lp-compare">
      <div className="lp-wrap">
        <div className="lp-head lp-head-c">
          <h2 className="lp-h2" id="lp-compare">
            {c.title}
          </h2>
          <p className="lp-lede">{c.sub}</p>
        </div>
        {/* Phones: one block per row, nothing wraps mid-price. Wider: the table. */}
        <div className="lp-compare-m">
          {c.rows.map((label, i) => (
            <dl key={label}>
              <dt>{label}</dt>
              <dd className="lp-us">
                {BRAND.name}: {c.us[i]}
              </dd>
              {COMPETITORS.map((x) => (
                <dd key={x.id}>
                  {x.name}: {get(x, i)}
                </dd>
              ))}
            </dl>
          ))}
        </div>
        <div className="lp-table-card">
        <table className="lp-table">
          <caption className="sr-only">
            {BRAND.name} compared with {COMPETITORS.map((x) => x.name).join(" and ")}, as of {formatAsOf(oldest)}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="lp-us">
                {BRAND.name}
              </th>
              {COMPETITORS.map((x) => (
                <th key={x.id} scope="col">
                  {x.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((label, i) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="lp-us">{c.us[i]}</td>
                {COMPETITORS.map((x) => (
                  <td key={x.id}>{get(x, i)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="lp-meta lp-sources">
          As of {formatAsOf(oldest)}. {c.foot} {notes.join(" ")} Sources:{" "}
          {COMPETITORS.map((x, i) => (
            <span key={x.id}>
              {i ? ", " : ""}
              <a href={x.sourceUrl}>{x.host}</a> ({formatAsOf(x.asOf)})
            </span>
          ))}
          .
        </p>
      </div>
    </section>
  );
}

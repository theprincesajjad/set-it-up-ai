import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { COMPETITORS, formatAsOf } from "@/lib/marketing/sources";

export { COMPETITORS } from "@/lib/marketing/sources";

/**
 * "How we compare" on the home page (landing v4, Clear): us against named, dated competitors, each cell read from the vendor's public
 * pricing page. The plans themselves are the home page's price cards (lib/marketing/plan-copy.ts).
 * Every row of COMPETITORS carries `asOf` and `sourceUrl`; a unit test fails when one is older than 90 days.
 */
export function CompetitorTable() {
  const c = copy.landing.compare;
  const oldest = COMPETITORS.map((x) => x.asOf).sort()[0]!;
  const notes = [...new Set(COMPETITORS.map((x) => x.currencyNote).filter(Boolean))];
  const get = (x: (typeof COMPETITORS)[number], row: number) => [x.monthlyFee, x.locations, x.salesFee][row]!;
  return (
    <section className="hm-sec" aria-labelledby="hm-compare">
      <div className="hm-wrap">
      <div className="hm-head">
        <h2 className="hm-h2" id="hm-compare">
          {c.title}
        </h2>
        <p className="hm-lede">{c.sub}</p>
      </div>
      {/* Phones: one block per row, nothing wraps mid-price. Wider: the table. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {c.rows.map((label, i) => (
          <dl key={label} className="card-clear px-5 py-4">
            <dt className="text-meta text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-title font-semibold text-foreground">
              {BRAND.name}: {c.us[i]}
            </dd>
            {COMPETITORS.map((x) => (
              <dd key={x.id} className="mt-1 text-meta text-muted-foreground">
                {x.name}: {get(x, i)}
              </dd>
            ))}
          </dl>
        ))}
      </div>
      <div className="card-clear hidden overflow-hidden sm:block">
        <table className="w-full text-[15px] leading-6">
          <caption className="sr-only">
            {BRAND.name} compared with {COMPETITORS.map((x) => x.name).join(" and ")}, as of {formatAsOf(oldest)}
          </caption>
          <thead className="bg-muted text-meta-strong text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-4 text-start md:px-6">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="px-5 py-4 text-start text-foreground md:px-6">
                {BRAND.name}
              </th>
              {COMPETITORS.map((x) => (
                <th key={x.id} scope="col" className="px-5 py-4 text-start md:px-6">
                  {x.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((label, i) => (
              <tr key={label} className="border-t border-border">
                <th scope="row" className="px-5 py-4 text-start font-normal text-muted-foreground md:px-6">
                  {label}
                </th>
                <td className="px-5 py-4 font-semibold text-foreground md:px-6">{c.us[i]}</td>
                {COMPETITORS.map((x) => (
                  <td key={x.id} className="px-5 py-4 text-muted-foreground md:px-6">
                    {get(x, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-4xl text-caption text-muted-foreground">
        As of {formatAsOf(oldest)}. {c.foot} {notes.join(" ")} Sources:{" "}
        {COMPETITORS.map((x, i) => (
          <span key={x.id}>
            {i ? ", " : ""}
            <a href={x.sourceUrl} className="underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
              {x.host}
            </a>{" "}
            ({formatAsOf(x.asOf)})
          </span>
        ))}
        .
      </p>
      </div>
    </section>
  );
}

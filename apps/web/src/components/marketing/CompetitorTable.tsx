import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { COMPETITORS, formatAsOf } from "@/lib/marketing/sources";
import { PriceStrip } from "./PriceStrip";
import { MHeading, MSection } from "./Section";

export { COMPETITORS } from "@/lib/marketing/sources";

/**
 * "What you won't pay": us against named, dated competitors, each cell read from the vendor's public pricing page.
 * Every row of COMPETITORS carries `asOf` and `sourceUrl`; a unit test fails when one is older than 90 days.
 */
export function CompetitorTable() {
  const c = copy.landing.compare;
  const oldest = COMPETITORS.map((x) => x.asOf).sort()[0]!;
  const notes = [...new Set(COMPETITORS.map((x) => x.currencyNote).filter(Boolean))];
  const get = (x: (typeof COMPETITORS)[number], row: number) => [x.monthlyFee, x.locations, x.salesFee][row]!;
  return (
    <MSection>
      <MHeading eyebrow={c.eyebrow} title={c.title} />
      {/* Phones: one block per row, nothing wraps mid-price. Wider: the table. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {c.rows.map((label, i) => (
          <dl key={label} className="rounded-card border border-line bg-bg px-5 py-4">
            <dt className="text-meta text-fg-muted">{label}</dt>
            <dd className="display mt-1 text-title text-fg">
              {BRAND.name}: {c.us[i]}
            </dd>
            {COMPETITORS.map((x) => (
              <dd key={x.id} className="mt-1 text-meta text-fg-muted">
                {x.name}: {get(x, i)}
              </dd>
            ))}
          </dl>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-sheet border border-line bg-bg sm:block">
        <table className="w-full text-body">
          <caption className="sr-only">
            {BRAND.name} compared with {COMPETITORS.map((x) => x.name).join(" and ")}, as of {formatAsOf(oldest)}
          </caption>
          <thead className="bg-bg-subtle text-meta-strong text-fg-muted">
            <tr>
              <th scope="col" className="px-5 py-4 text-start md:px-6">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="px-5 py-4 text-start text-fg md:px-6">
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
              <tr key={label} className="border-t border-line">
                <th scope="row" className="px-5 py-4 text-start font-normal text-fg-muted md:px-6">
                  {label}
                </th>
                <td className="px-5 py-4 text-body-strong text-fg md:px-6">{c.us[i]}</td>
                {COMPETITORS.map((x) => (
                  <td key={x.id} className="px-5 py-4 text-fg-muted md:px-6">
                    {get(x, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-4xl text-caption text-fg-muted">
        As of {formatAsOf(oldest)}. {c.foot} {notes.join(" ")} Sources:{" "}
        {COMPETITORS.map((x, i) => (
          <span key={x.id}>
            {i ? ", " : ""}
            <a href={x.sourceUrl} className="underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg">
              {x.host}
            </a>{" "}
            ({formatAsOf(x.asOf)})
          </span>
        ))}
        .
      </p>
      <PriceStrip />
    </MSection>
  );
}

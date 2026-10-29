import { FEES, FREE_REMINDER_SMS_PER_MONTH, PLANS } from "@ll/shared";
import { SOLO_COMPETITORS, SOLO_ROWS, type SoloCell, type SoloRow } from "@/lib/marketing/competitors-solo";
import { formatAsOf } from "@/lib/marketing/sources";
import { fill, moneyShort } from "@/lib/marketing/text";
import { MHeading, MSection } from "./Section";

export interface SoloCompareCopy {
  eyebrow: string;
  title: string;
  sub: string;
  brand: string;
  rows: Record<SoloRow | "chairs", string>;
  us: Record<SoloRow | "chairs", string>;
  usSource: string;
  foot: string;
}

const ASOF = "2026-10-28";

/** Our cells: every number from PLANS and FEES, so a price change shows here without an edit. */
function usCells(c: SoloCompareCopy): Record<SoloRow | "chairs", string> {
  const vars = { plus: moneyShort(PLANS.plus.priceCents), fee: String(FEES.depositInvoiceBps / 100), free: FREE_REMINDER_SMS_PER_MONTH, paid: PLANS.plus.smsPerMonth };
  return Object.fromEntries(Object.entries(c.us).map(([k, v]) => [k, fill(v, vars)])) as Record<SoloRow | "chairs", string>;
}

function Cell({ cell }: { cell: SoloCell }) {
  return (
    <>
      <span className="block text-body text-foreground">{cell.text}</span>
      <span className="mt-1 block text-caption text-muted-foreground">
        {formatAsOf(ASOF)} · {cell.note}
      </span>
    </>
  );
}

/**
 * Us against Fresha, Booksy and Square Appointments. Every competitor cell carries the date it was read and a currency or source note.
 * `chairs` adds the four-chair row. Lives on /pricing (#booking-apps); the solo landing pages link to it from their price block.
 */
export function CompetitorTableSolo({ c, chairs, id = "compare" }: { c: SoloCompareCopy; chairs?: boolean; id?: string }) {
  const rows: (SoloRow | "chairs")[] = chairs ? [...SOLO_ROWS, "chairs"] : [...SOLO_ROWS];
  const us = usCells(c);
  const get = (id: (typeof SOLO_COMPETITORS)[number], r: SoloRow | "chairs"): SoloCell => (r === "chairs" ? id.fourChairs : id.cells[r]);
  return (
    <MSection id={id} className="scroll-mt-20">
      <MHeading eyebrow={c.eyebrow} title={c.title} sub={c.sub} />
      {/* Phones: one block per row. Wider: the table. */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <dl key={r} className="rounded-card bg-card px-5 py-4 shadow-card">
            <dt className="text-meta text-muted-foreground">{c.rows[r]}</dt>
            <dd className="display mt-1 text-title text-foreground">
              {c.brand}: {us[r]}
            </dd>
            {SOLO_COMPETITORS.map((x) => (
              <dd key={x.id} className="mt-2 text-meta text-muted-foreground">
                <span className="font-semibold text-foreground">{x.name}:</span> {get(x, r).text}
                <span className="block text-caption">
                  {formatAsOf(x.asOf)} · {get(x, r).note}
                </span>
              </dd>
            ))}
          </dl>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-sheet bg-card shadow-card md:block">
        <table className="w-full text-start text-body">
          <caption className="sr-only">
            {c.brand} compared with {SOLO_COMPETITORS.map((x) => x.name).join(", ")}, read {formatAsOf(ASOF)}
          </caption>
          <thead className="bg-tile-mint text-meta-strong text-tile-mint-foreground">
            <tr>
              <th scope="col" className="px-5 py-4 text-start">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="px-5 py-4 text-start text-foreground">
                {c.brand}
              </th>
              {SOLO_COMPETITORS.map((x) => (
                <th key={x.id} scope="col" className="px-5 py-4 text-start">
                  {x.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-border align-top">
                <th scope="row" className="px-5 py-4 text-start font-normal text-muted-foreground">
                  {c.rows[r]}
                </th>
                <td className="bg-tile-mint/50 px-5 py-4 text-tile-mint-foreground">
                  <span className="block text-body-strong">{us[r]}</span>
                  <span className="mt-1 block text-caption">{c.usSource}</span>
                </td>
                {SOLO_COMPETITORS.map((x) => (
                  <td key={x.id} className="px-5 py-4">
                    <Cell cell={get(x, r)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-4xl text-caption text-muted-foreground">
        {c.foot} Sources:{" "}
        {SOLO_COMPETITORS.map((x, i) => (
          <span key={x.id}>
            {i ? ", " : ""}
            <a href={x.sourceUrl} className="underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
              {x.host}
            </a>
          </span>
        ))}
        .
      </p>
    </MSection>
  );
}

import { Check } from "lucide-react";
import { FREE_REMINDER_SMS_PER_MONTH, PLANS } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { fill, moneyShort } from "@/lib/marketing/text";
import { MHeading, MSection } from "./Section";

export interface PlanStripCopy {
  eyebrow: string;
  title: string;
  note: string;
  free: string;
  monthly: string;
  yearly: string;
  see: string;
  lists: { free: readonly string[]; paid: readonly string[]; yearly: readonly string[] };
}

/** Free, the monthly plan and the annual plan with the site. Every price is read from PLANS, never typed here. */
export function PlanStrip({ c }: { c: PlanStripCopy }) {
  const plus = PLANS.plus;
  const monthsPaid = Math.round(plus.annualPriceCents / plus.priceCents);
  const vars = { freeTexts: FREE_REMINDER_SMS_PER_MONTH, texts: plus.smsPerMonth.toLocaleString("en-CA"), months: monthsPaid };
  const cards = [
    { key: "free", name: c.free, price: moneyShort(0), per: "", items: c.lists.free },
    { key: "monthly", name: plus.name, price: moneyShort(plus.priceCents), per: c.monthly, items: c.lists.paid },
    { key: "yearly", name: plus.name, price: moneyShort(plus.annualPriceCents), per: c.yearly, items: c.lists.yearly },
  ];
  return (
    <MSection tone="ink" id="plans">
      <MHeading eyebrow={c.eyebrow} title={c.title} onBand />
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.key} className="flex flex-col rounded-sheet bg-background p-6 text-foreground md:p-7">
            <p className="text-body-strong">{card.name}</p>
            <p className="display mt-2 text-mkt-md tabular-nums">
              {card.price}
              {card.per ? <span className="ms-2 text-body font-normal text-muted-foreground">{card.per}</span> : null}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5 text-body">
              {card.items.map((i) => (
                <li key={i} className="flex gap-2.5">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-positive-text" strokeWidth={2.5} />
                  {fill(i, vars)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-body">{c.note}</p>
      <Button variant="inverse" size="lg" href="/pricing" className="mt-6">
        {c.see}
      </Button>
    </MSection>
  );
}

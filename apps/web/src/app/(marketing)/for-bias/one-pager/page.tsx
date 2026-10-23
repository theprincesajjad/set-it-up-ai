"use client";
import { Printer } from "lucide-react";
import { campaignsApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { MSection } from "@/components/marketing/Section";
import { copy } from "@/copy/en-CA";
import { moneyShort } from "@/lib/marketing/text";

const P = campaignsApi.CAMPAIGN_PACKAGES;

/** The grant-ready one-pager: what the campaign is, what it costs, what is measured and what is not. Prints on one page; no email needed. */
export default function OnePagerPage() {
  return (
    <MSection className="md:py-16!">
      <article className="mx-auto max-w-3xl text-fg">
        <p className="text-meta-strong text-fg-muted print:hidden">For BIAs</p>
        <h1 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg print:text-[32px]">a street campaign, in one page.</h1>
        <p className="mt-4 text-body text-fg-muted">A shop-local campaign run through the loyalty app your shops already use, with a board report at the end.</p>

        <h2 className="mt-8 text-headline">Packages</h2>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {(Object.keys(P) as (keyof typeof P)[]).map((k) => (
            <li key={k} className="flex items-baseline justify-between gap-4 py-3 text-body">
              <span>
                {P[k].name} <span className="text-fg-muted">· {P[k].days} days · visit {P[k].goalVisits} shops</span>
              </span>
              <span className="tabular-nums font-semibold">{moneyShort(P[k].priceCents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-meta text-fg-muted">{copy.bia.packages.includes}</p>

        <h2 className="mt-8 text-headline">What the report measures</h2>
        <ul className="mt-2 list-disc ps-5 text-body text-fg-muted">
          <li>Visits at participating shops against the same number of days before.</li>
          <li>New members, and how many shoppers took part and completed the passport.</li>
          <li>Event visitors who came back within 30 days: the “conversion” measure the OBIAA and TABIA study found no data source for.</li>
          <li>Sales amounts are planned, not included: they need each shop’s opt-in.</li>
        </ul>

        <h2 className="mt-8 text-headline">Measurement plan</h2>
        <p className="mt-2 text-body text-fg-muted">A board report within 3 business days of the event, and a CSV. The same measures are repeated for every campaign, so the board can compare events. Aggregates only: no names, phone numbers or customer lists leave the platform.</p>

        <h2 className="mt-8 text-headline">How BIAs pay</h2>
        <p className="mt-2 text-body text-fg-muted">{copy.bia.pay.body}</p>

        <Button iconStart={Printer} onClick={() => window.print()} className="mt-8 print:hidden">
          Print or save as PDF
        </Button>
      </article>
    </MSection>
  );
}

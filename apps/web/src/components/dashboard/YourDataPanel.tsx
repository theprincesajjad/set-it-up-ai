"use client";
import { Download, FileArchive } from "lucide-react";
import { useEffect, useState } from "react";
import { MERCHANT_EXPORTS, RETENTION } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { BFF_BASE } from "@/lib/api/browser";
import { useMerchant } from "./MerchantContext";
import { Panel, Row, RowList } from "./kit";

/** Merchant agreement 2.1: the owner's copy of every kind of record, on a paid plan or for 90 days after leaving. */
export function YourDataPanel() {
  const { api, enabled } = useMerchant();
  const paid = enabled("customers.csv_export");
  // A shop that left (closed, or back on Free) can still export for 90 days even without the paid feature.
  const [until, setUntil] = useState<string | null>(null);
  useEffect(() => {
    if (paid) return;
    let live = true;
    api.exportWindow().then((w) => live && setUntil(w.until)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, paid]);

  if (!paid && !until)
    return (
      <Panel title="Your data" description="Your members and their history belong to you.">
        <p className="text-meta text-fg">
          Downloads of your members, orders, bookings, reviews and messages come with a paid plan. If you close your shop or move back to Free, you keep a free export of all of it for {RETENTION.leaverExportDays} days.
        </p>
        <p className="mt-3 text-meta text-fg">Need a copy now? Email help@localloyalty.example and we&apos;ll send it within 30 days.</p>
        <p className="mt-3 text-meta text-fg-muted">We keep balance and purchase history for 7 years for tax and dispute reasons. Phone numbers stay hidden in lists.</p>
      </Panel>
    );

  const href = (file: string) => `${BFF_BASE}${api.base}/exports/${file}`;
  return (
    <Panel
      title="Your data"
      description="Everything your customers gave you at your shop. Customers' other shops are never included."
    >
      {!paid && until ? <p className="mb-3 text-meta text-fg">Your free export is open until {new Date(until).toLocaleDateString("en-CA", { dateStyle: "long" })}.</p> : null}
      <Button variant="primary" size="sm" iconStart={FileArchive} href={href("all.zip")} className="mb-3 w-full md:w-auto">
        Download everything (ZIP)
      </Button>
      <RowList label="Data you can download">
        {MERCHANT_EXPORTS.map((d) => (
          <Row
            key={d.key}
            title={d.label}
            meta={d.description}
            trailing={
              <Button variant="secondary" size="sm" iconStart={Download} href={href(`${d.key}.csv`)}>
                CSV<span className="sr-only"> download, {d.label}</span>
              </Button>
            }
          />
        ))}
      </RowList>
      <p className="mt-3 text-meta text-fg-muted">
        You are responsible for using these files lawfully. Message only members who agreed (marketing_consent_at in Members) and have not replied STOP, and check may_follow_up in Reviews before you reach out. Customers who deleted their account have no personal details in these files.
      </p>
      <p className="mt-2 text-meta text-fg-muted">We keep balance and purchase history for 7 years for tax and dispute reasons. Phone numbers stay hidden in lists.</p>
    </Panel>
  );
}

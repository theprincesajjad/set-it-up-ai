"use client";
import Link from "next/link";
import { campaignsApi, type campaignsApi as C } from "@ll/shared";
import { EmptyState, Panel, StatusDot } from "@/components/dashboard";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatNumber, formatMoney } from "@/lib/format";

/** What a campaign row says on the right: results once it has run, the package and payment before, what is missing for a draft. */
export function campaignResultText(c: C.Campaign, r: C.CampaignReport | null): string {
  if ((c.status === "live" || c.status === "ended") && r) return `${formatNumber(r.participants)} took part · ${formatNumber(r.completions)} completed`;
  if (c.status === "scheduled") {
    const tier = campaignsApi.CAMPAIGN_PACKAGES[c.kind].name.split(":")[0]!;
    return `${tier} · ${formatMoney(c.priceCents).replace(/\.00$/, "")} · ${c.paid || c.priceCents === 0 ? "paid" : "unpaid"}`;
  }
  if (c.status === "draft") return c.merchants.length ? (c.priceCents > 0 && !c.paid ? "Pay to schedule" : "Ready to schedule") : "Add shops to schedule";
  return "";
}

function Row({ c }: { c: C.Campaign }) {
  const report = useApi(c.status === "live" || c.status === "ended" ? () => browserApi.campaigns.report(c.id) : null, [c.id, c.status]);
  return (
    <li>
      <Link href={`/bia/campaigns/${c.id}`} className="flex flex-col gap-1 py-3 hover:bg-bg-subtle focus-visible:focus-ring sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body-strong text-fg">{c.name}</h3>
          <p className="truncate text-meta text-fg-muted">
            {formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.merchants.length} {c.merchants.length === 1 ? "shop" : "shops"}
          </p>
        </div>
        <p className="shrink-0 text-meta text-fg-muted tabular">{campaignResultText(c, report.data)}</p>
        <span className="w-24 shrink-0">
          <StatusDot domain="campaign" status={c.status} />
        </span>
      </Link>
    </li>
  );
}

/** The street's latest campaigns with status and result; the working view that used to be the whole of /bia. */
export function CampaignsPanel({ hoodId }: { hoodId: string }) {
  const list = useApi(() => browserApi.campaigns.list({ neighbourhoodId: hoodId, limit: 4 }), [hoodId]);
  return (
    <Panel title="Campaigns" action={<Link href="/bia/campaigns" className="text-meta-strong text-fg-muted hover:text-fg">All campaigns</Link>}>
      <ListAsync state={list} errorTitle="We could not load the campaigns.">
        {(d) =>
          d.items.length ? (
            <ul className="divide-y divide-line">{d.items.map((c) => <Row key={c.id} c={c} />)}</ul>
          ) : (
            <EmptyState title="No campaigns yet" description="A passport week is the easiest way to show the board what an event did." action={<Button variant="secondary" size="sm" href="/bia/campaigns?new=1">New campaign</Button>} />
          )
        }
      </ListAsync>
    </Panel>
  );
}

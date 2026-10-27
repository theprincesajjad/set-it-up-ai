"use client";
/**
 * The grocer's morning (docs/research/grocers.md, frame D1): what to prepare at the butcher counter today, who is probably running
 * low on a bulk staple, and this week's flyer, with the festival that is coming. Sits under the usual numbers on the Home page.
 */
import { Panel, RowList, Row, Tag, Dot } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { formatTime } from "@/lib/format";
import { BUTCHER_STATUS, daysWords, dealDates, intervalWords, seasonFlyerLine } from "@/lib/grocery";
import { useApi } from "@/lib/dashboard/useApi";

export function GroceryHome() {
  const { api, base, enabled } = useMerchant();
  const home = useApi(() => api.grocery.home(), [api], { pollMs: 60_000 });
  const d = home.data;
  if (!d) return home.error ? null : <div className="skeleton h-[220px] w-full rounded-card" />;
  const butcherOn = enabled("grocery.counter_preorders");
  const pantryOn = enabled("grocery.pantry_reminders");
  const flyerOn = enabled("grocery.flyer");
  return (
    <div className="flex flex-col gap-4">
      {d.season ? (
        <Banner
          tone="info"
          title={`${d.season.name} is ${daysWords(d.season.daysUntil)}`}
          action={
            <Button size="sm" variant="secondary" href={d.season.qurbani ? `${base}/grocery/butcher?tab=eid` : `${base}/grocery/flyer`}>
              {d.season.qurbani ? "Plan qurbani" : "Open the flyer"}
            </Button>
          }
        >
          {seasonFlyerLine(d.season)}. {d.season.ideas.slice(0, 3).join(", ")}.
        </Banner>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {butcherOn ? (
          <Panel title="Butcher counter today" action={<Button size="sm" variant="ghost" href={`${base}/grocery/butcher`}>See all</Button>}>
            {d.butcher.length ? (
              <RowList label="Pre-orders for today">
                {d.butcher.slice(0, 5).map((o) => (
                  <Row
                    key={o.id}
                    leading={<span className="w-12 text-meta font-semibold tabular text-fg-muted">{o.at ? formatTime(o.at) : ""}</span>}
                    title={o.customer ?? "Customer"}
                    meta={o.summary}
                    trailing={<Tag tone={BUTCHER_STATUS[o.status].tone === "accent" ? "accent" : "neutral"}>{BUTCHER_STATUS[o.status].label}</Tag>}
                  />
                ))}
              </RowList>
            ) : (
              <p className="text-meta text-fg-muted">No pre-orders for today.</p>
            )}
          </Panel>
        ) : null}
        {pantryOn ? (
          <Panel title="Probably running low" action={<Button size="sm" variant="ghost" href={`${base}/grocery/pantry`}>See all</Button>}>
            {d.pantry.dueSoon.length ? (
              <RowList label="Due for a restock text">
                {d.pantry.dueSoon.map((x) => (
                  <Row key={x.entryId} title={x.name ?? "Customer"} meta={`${x.itemName} · ${intervalWords(x.intervalDays)}`} trailing={<span className="text-meta font-semibold text-accent-text">{dealDates(x.dueOn, x.dueOn)}</span>} />
                ))}
              </RowList>
            ) : (
              <p className="text-meta text-fg-muted">{d.pantry.members ? "Nobody is due this week." : "Ask at the counter: a text before they run out of atta."}</p>
            )}
            <p className="mt-2 text-caption text-fg-muted">{d.pantry.members} {d.pantry.members === 1 ? "member agreed" : "members agreed"} to restock texts.</p>
          </Panel>
        ) : null}
        {flyerOn ? (
          <Panel title="This week's flyer" action={<Button size="sm" variant="ghost" href={`${base}/grocery/flyer`}>Edit</Button>}>
            <p className="text-body text-fg">
              <Dot tone={d.flyer.live ? "positive" : "neutral"}>{d.flyer.live ? `${d.flyer.live} ${d.flyer.live === 1 ? "deal" : "deals"} running` : "No deals running"}</Dot>
            </p>
            <p className="mt-1 text-meta text-fg-muted">
              {d.flyer.live && d.flyer.ends ? `Next one ends ${dealDates(d.flyer.ends, d.flyer.ends)}. ` : ""}
              {d.flyer.upcoming ? `${d.flyer.upcoming} coming up.` : d.flyer.live ? "" : "Add this week's deals so customers see them on your shop page."}
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

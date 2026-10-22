"use client";
import { EmptyState, ErrorLine, PageHeader, RowList, SkeletonRows, StatusDot, Tag } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/** Street campaigns run by the BIA: merchants opt in or out before they start. */
export default function MerchantCampaignsPage() {
  return (
    <FeatureGate keys={["campaigns.neighbourhood"]} title="Neighbourhood campaigns">
      <List />
    </FeatureGate>
  );
}

function List() {
  const { api } = useMerchant();
  const list = useApi(() => api.campaigns(), [api]);
  const act = useAction();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Street campaigns" description="Your BIA's events: customers visit shops on the strip to earn bonus points and win prizes. Free for you to join." />
      {act.error ? <ErrorLine message={act.error} /> : null}
      <Async state={list} skeleton={<SkeletonRows rows={3} />}>
        {(d) =>
          d.items.length ? (
            <RowList label="Campaigns">
              {d.items.map((c) => (
                <li key={c.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="text-body-strong text-fg">{c.name}</h2>
                      <StatusDot domain="campaign" status={c.status} />
                      {c.joined ? <Tag>You&apos;re in</Tag> : null}
                    </div>
                    <p className="mt-0.5 text-meta text-fg-muted tabular">{formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.merchants.length} shops · visit {c.goalVisits} to enter{c.prize ? ` · Prize: ${c.prize}` : ""}</p>
                    {c.description ? <p className="mt-1 text-meta text-fg">{c.description}</p> : null}
                  </div>
                  {c.canChange ? (
                    <Button className="shrink-0 self-start" size="sm" variant={c.joined ? "secondary" : "primary"} loading={act.busy} onClick={async () => {
                      await act.run(() => (c.joined ? api.leaveCampaign(c.id) : api.joinCampaign(c.id)));
                      await list.reload();
                    }}>
                      {c.joined ? "Leave" : "Join campaign"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </RowList>
          ) : (
            <EmptyState title="No campaigns on your street right now" description="When your BIA plans one, you can join it here." />
          )
        }
      </Async>
    </div>
  );
}

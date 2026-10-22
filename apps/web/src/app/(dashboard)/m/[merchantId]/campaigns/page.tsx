"use client";
import { ClipboardList } from "lucide-react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
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
    <div className="flex flex-col gap-4">
      <PageHeader title="Street campaigns" description="Your BIA's events: customers visit shops on the strip to earn bonus points and win prizes. Free for you to join." />
      <Async state={list}>
        {(d) =>
          d.items.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {d.items.map((c) => (
                <li key={c.id}>
                  <Card padding="lg" className="flex h-full flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-title text-fg">{c.name}</h2>
                      <StatusBadge domain="campaign" status={c.status} />
                      {c.joined ? <Badge tone="success">You&apos;re in</Badge> : null}
                    </div>
                    <p className="text-meta text-fg-muted">{formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.merchants.length} shops · visit {c.goalVisits} to enter{c.prize ? ` · Prize: ${c.prize}` : ""}</p>
                    {c.description ? <p className="text-meta text-fg">{c.description}</p> : null}
                    {c.canChange ? (
                      <Button className="mt-auto self-start" variant={c.joined ? "secondary" : "primary"} loading={act.busy} onClick={async () => {
                        await act.run(() => (c.joined ? api.leaveCampaign(c.id) : api.joinCampaign(c.id)));
                        await list.reload();
                      }}>
                        {c.joined ? "Leave" : "Join campaign"}
                      </Button>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ClipboardList} title="No campaigns on your street right now" description="When your BIA plans one, you can join it here." />
          )
        }
      </Async>
      {act.error ? <p className="text-negative">{act.error}</p> : null}
    </div>
  );
}

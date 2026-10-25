"use client";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { PageHeader, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { PickupLadder } from "@/components/dashboard/service/PickupLadder";
import { RebookDueList, type RebookTab } from "@/components/dashboard/service/RebookDueList";
import { RebookPreview, RebookRules } from "@/components/dashboard/service/RebookRules";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";

export default function RebookingPage() {
  return (
    <FeatureGate keys={["service.rebooking"]} title="Rebooking and pickup reminders">
      <Rebooking />
    </FeatureGate>
  );
}

function Rebooking() {
  const { api, base, detail, enabled, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [tab, setTab] = useState<RebookTab>("due");
  const [busy, setBusy] = useState<string | null>(null);
  const now = new Date(useNow());
  const data = useApi(() => api.serviceOps.rebooking(tab), [api, tab], { pollMs: 60_000 });
  const rules = useApi(() => api.serviceOps.rebookRules(), [api]);
  const hasTickets = enabled("service.tickets");
  const uncollected = useApi(hasTickets ? () => api.serviceOps.uncollected() : null, [api, hasTickets], { pollMs: 60_000 });
  const manager = role !== "staff";
  const reloadAll = async () => {
    await Promise.all([data.reload(), uncollected.reload()]);
  };
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    const r = await act.run(fn);
    setBusy(null);
    if (r !== undefined) {
      toast({ message: ok, tone: "success" });
      await reloadAll();
    }
  };
  const dueNow = data.data ? data.data.counts.due : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Rebooking"
        description="Nudge regulars once when they are due, in their language, with a link that books the same service."
        actions={
          manager ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-meta text-fg-muted">
                Send automatically
                <SwitchControl
                  checked={data.data?.settings.auto ?? false}
                  ariaLabel="Send automatically"
                  onChange={async (auto) => {
                    const r = await act.run(() => api.serviceOps.rebookAuto(auto));
                    if (r) await data.reload();
                  }}
                />
              </label>
              <Button
                size="sm"
                loading={busy === "all"}
                disabled={!dueNow}
                onClick={() =>
                  run("all", async () => {
                    const r = await api.serviceOps.rebookSendAll();
                    toast({ message: `Sent ${r.sent}${r.skipped ? `, ${r.skipped} skipped (no consent, snoozed or out of texts)` : ""}`, tone: "success" });
                    return r;
                  }, "Done")
                }
              >
                Send {dueNow} due today
              </Button>
            </div>
          ) : undefined
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={data}>
        {(d) => (
          <>
            <StatBlock
              label="Rebooking at a glance"
              cols={5}
              items={[
                { label: "Due this week", dot: "neutral", value: d.stats.dueThisWeek, caption: `${d.counts.late} already late` },
                { label: "Sent, last 30 days", dot: "neutral", value: d.stats.sentLast30, caption: `Text ${d.stats.sentSms}, app push ${d.stats.sentPush}` },
                { label: "Booked within 7 days", dot: "neutral", value: d.stats.nudgedCount ? `${Math.round((d.stats.bookedWithin7Days / d.stats.nudgedCount) * 100)}%` : "None yet", caption: "Of those who got a nudge" },
                { label: "Snoozed", dot: "neutral", value: d.counts.snoozed, caption: "Hidden for now" },
                { label: "Opted out", dot: "neutral", value: d.stats.optedOut, caption: "Replied STOP or muted" },
              ]}
            />
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <RebookDueList
                data={d}
                tab={tab}
                onTab={setTab}
                now={now}
                busyKey={busy}
                onSend={(r) => run(`send:${r.userId}:${r.serviceId}`, () => api.serviceOps.rebookSend(r.userId, r.serviceId), `Sent to ${r.customerName ?? "customer"}`)}
                onSkip={(r) => run(`skip:${r.userId}:${r.serviceId}`, async () => (await api.serviceOps.rebookSkip(r.userId, r.serviceId), true), "Skipped for this cycle")}
                onSnooze={(r) => run(`snooze:${r.userId}:${r.serviceId}`, async () => (await api.serviceOps.rebookSnooze(r.userId, r.serviceId, 14), true), "Snoozed for two weeks")}
              />
              <div className="flex flex-col gap-6">
                <Async state={rules}>
                  {(r) => (
                    <RebookRules
                      rules={r.items}
                      onChange={async (id, days) => {
                        const res = await act.run(() => api.serviceOps.setRebookRule(id, days));
                        if (res) await Promise.all([rules.reload(), data.reload()]);
                      }}
                    />
                  )}
                </Async>
                <RebookPreview shop={detail.merchant.name} slug={detail.merchant.slug} name={d.items[0]?.customerName ?? "Ritu Gill"} service={d.items[0]?.serviceName ?? rules.data?.items.find((x) => x.rebookAfterDays)?.name ?? "haircut"} weeks={Math.max(1, Math.round((d.items[0]?.rebookAfterDays ?? 28) / 7))} />
              </div>
            </div>
          </>
        )}
      </Async>
      {hasTickets && uncollected.data ? (
        <PickupLadder
          data={uncollected.data as serviceApi.UncollectedResponse}
          ticketHref={(id) => `${base}/tickets/${id}`}
          onRecord={async (id) => {
            await api.serviceOps.lienNotice(id);
            await uncollected.reload();
          }}
        />
      ) : null}
    </div>
  );
}

"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Capsules, EmptyState, ErrorLine, PageHeader, SkeletonRows } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CopyButton, TierTeaser, formatPhone } from "@/components/dashboard/restaurant/shared";
import { TakeOrderSheet } from "@/components/dashboard/restaurant/TakeOrderSheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { useApi } from "@/lib/dashboard/useApi";
import { CallDetail } from "./CallDetail";
import { CallStatus, callStatus, languageName } from "./CallStatus";

type Filter = "all" | "look" | "order" | "missed";

export default function PhoneOrdersPage() {
  return (
    <Suspense>
      <PhoneOrders />
    </Suspense>
  );
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const same = d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  return same ? d.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").toLowerCase() : d.toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });
};

function PhoneOrders() {
  const { api, merchantId, enabled } = useMerchant();
  const params = useSearchParams();
  const ai = enabled("restaurant.phone_ai");
  const [filter, setFilter] = useState<Filter>("look");
  const [sel, setSel] = useState<string | null>(params.get("call"));
  const [taking, setTaking] = useState<"phone" | "usual" | null>(null);
  const [mobile, setMobile] = useState<"list" | "detail">(params.get("call") ? "detail" : "list");
  const list = useApi(ai ? () => api.phone.calls({ limit: 100 }) : null, [api, ai], { pollMs: 20_000 });
  const catalog = useApi(() => api.catalog(), [api]);
  const [local, setLocal] = useState<Record<string, whatsappApi.PhoneCallDto>>({});
  const calls = useMemo(() => (list.data?.items ?? []).map((c) => local[c.id] ?? c), [list.data, local]);
  const counts = useMemo(() => ({ all: calls.length, look: calls.filter((c) => callStatus(c).filter === "look").length, order: calls.filter((c) => callStatus(c).filter === "order").length, missed: calls.filter((c) => callStatus(c).filter === "missed").length }), [calls]);
  const shown = useMemo(() => (filter === "all" ? calls : calls.filter((c) => callStatus(c).filter === filter)), [calls, filter]);
  // Land on the calls that need a look; fall back to all calls when none does.
  useEffect(() => {
    if (list.data && filter === "look" && counts.look === 0 && !params.get("call")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilter("all");
    }
  }, [list.data, filter, counts.look, params]);
  const current = calls.find((c) => c.id === sel) ?? shown[0] ?? null;
  const webhook = `${env.apiUrl}/v1/webhooks/phone/${merchantId}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Phone orders"
        description="Calls drafted into orders. Check, fix, confirm. Or take a call yourself in ten seconds."
        actions={
          <>
            <Button size="md" variant="secondary" onClick={() => setTaking("usual")}>Repeat a regular&apos;s usual</Button>
            <Button size="md" onClick={() => setTaking("phone")}>Take a phone order</Button>
          </>
        }
      />
      {!ai ? (
        <TierTeaser featureKey="restaurant.phone_ai" title="Phone assistant" description="The assistant listens in Urdu, Hindi, Punjabi or English and drafts the order for you to check." inline />
      ) : (
        <>
          <Capsules<Filter>
            label="Filter calls"
            value={filter}
            onChange={(f) => setFilter(f)}
            options={[
              { value: "all", label: "All calls", count: counts.all },
              { value: "look", label: "Needs a look", count: counts.look, tone: "info" },
              { value: "order", label: "Became an order", count: counts.order },
              { value: "missed", label: "Missed", count: counts.missed },
            ]}
          />
          {list.error && !list.data ? <ErrorLine message={list.error} onRetry={() => void list.reload()} /> : null}
          {list.loading && !list.data ? <SkeletonRows rows={5} /> : null}
          {list.data && !calls.length ? (
            <EmptyState
              title="No phone orders yet"
              description={`When a guest calls, the draft order lands here. To start, point your phone line's voice webhook at ${webhook}`}
              action={<CopyButton text={webhook} label="Copy webhook URL" />}
            />
          ) : null}
          {calls.length ? (
            <div className="overflow-hidden rounded-card bg-card shadow-card lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
              <ul aria-label="Calls" className={cn("max-h-[640px] divide-y divide-line overflow-y-auto border-line lg:border-e", mobile === "detail" ? "hidden lg:block" : "block")}>
                {shown.length ? (
                  shown.map((c) => {
                    const n = c.draftOrder?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
                    const check = c.unmatched.length + c.ambiguous.length + (c.draftOrder?.items.filter((i) => i.uncertain).length ?? 0);
                    const on = current?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button type="button" aria-current={on ? "true" : undefined} onClick={() => { setSel(c.id); setMobile("detail"); }} className={cn("flex w-full flex-col gap-0.5 px-5 py-3.5 text-start focus-visible:focus-ring", on ? "bg-bg-subtle" : "hover:bg-bg-subtle")}>
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-body font-medium text-fg">{c.callerName ?? formatPhone(c.fromPhone)}</span>
                            <span className="shrink-0 text-caption text-fg-muted">{timeOf(c.createdAt)}</span>
                          </span>
                          <span className="truncate text-meta text-fg-muted">
                            {languageName(c.language)} · {n ? `${n} ${n === 1 ? "item" : "items"}` : "no items"}
                            {check ? `, ${check} to check` : ""}
                          </span>
                          <CallStatus call={c} />
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li className="p-5">
                    <EmptyState title="No calls with that status" action={<button type="button" onClick={() => setFilter("all")} className="text-meta font-medium text-fg underline decoration-line underline-offset-4">Show all calls</button>} />
                  </li>
                )}
              </ul>
              <div className={cn("min-w-0", mobile === "list" ? "hidden lg:block" : "block")}>
                {current ? (
                  <>
                    <button type="button" onClick={() => setMobile("list")} className="m-3 inline-flex h-9 items-center rounded-full border border-line px-3 text-meta-strong lg:hidden">All calls</button>
                    <CallDetail key={`${current.id}-${current.status}`} call={current} catalog={catalog.data?.items ?? null} onChanged={(c) => { setLocal((l) => ({ ...l, [c.id]: c })); void list.reload(); }} />
                  </>
                ) : (
                  <p className="hidden p-8 text-meta text-fg-muted lg:block">Pick a call to check it.</p>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
      <TakeOrderSheet open={taking !== null} mode="phone" prefill={taking === "usual" ? { usual: true } : undefined} onClose={() => setTaking(null)} />
    </div>
  );
}

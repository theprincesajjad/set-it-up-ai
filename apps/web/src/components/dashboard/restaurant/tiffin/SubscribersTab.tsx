"use client";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { RecordPaymentPanel } from "../RecordPaymentPanel";
import { Capsules, DefList, Dot, EmptyState, Section, SidePanel as Sheet, type DotTone } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateYear, formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { TierTeaser, addDaysISO, dayLabel, dayShort, todayISO } from "../common";
import { daysText } from "./PlansTab";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
type StatusFilter = "all" | "awaiting" | tiffinApi.TiffinSubStatus;
const STATUS_TONE: Record<tiffinApi.TiffinSubStatus, [DotTone, string]> = {
  pending: ["info", "Waiting for payment"],
  active: ["positive", "Active"],
  paused: ["neutral", "Paused"],
  past_due: ["negative", "Past due"],
  cancelled: ["neutral", "Cancelled"],
};
const PAY_LABEL: Record<tiffinApi.TiffinPaymentMethod, string> = { card: "Card", pad: "Bank debit (PAD)", etransfer: "E-transfer", cash: "Cash" };
/** A hand-paid subscriber with money to record reads "Awaiting e-transfer" (info blue: waiting on the customer). */
const waiting = (r: Pick<tiffinApi.SubscriberDto, "awaitingCents" | "status" | "paymentMethod">) => r.status !== "cancelled" && r.status !== "paused" && (r.awaitingCents > 0 || (r.status === "pending" && (r.paymentMethod === "etransfer" || r.paymentMethod === "cash")));
const StatusWord = ({ s, r }: { s: tiffinApi.TiffinSubStatus; r?: tiffinApi.SubscriberDto }) =>
  r && waiting(r) && s !== "past_due" ? <Dot tone="info">{r.paymentMethod === "cash" ? "Awaiting cash" : "Awaiting e-transfer"}</Dot> : <Dot tone={STATUS_TONE[s][0]}>{STATUS_TONE[s][1]}</Dot>;

export function SubscribersTab({ goPlans, gate }: { goPlans: () => void; gate: Gate }) {
  const { api } = useMerchant();
  const sp = useSearchParams();
  const fromUrl = sp.get("status");
  const [status, setStatus] = useState<StatusFilter>((["awaiting", "active", "paused", "past_due", "cancelled"] as const).find((x) => x === fromUrl) ?? "all");
  const [planId, setPlanId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [fulfilment, setFulfilment] = useState("");
  const [payment, setPayment] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const plans = useApi(() => api.tiffin.plans(), [api]);
  const routes = useApi(() => api.tiffin.routes(), [api]);
  const everyone = useApi(() => api.tiffin.subscribers({ limit: 200 }), [api]);
  const key = [status, planId, routeId, fulfilment, payment, dq].join("|");
  const query = { status: status === "all" || status === "awaiting" ? undefined : status, awaiting: status === "awaiting" ? "true" : undefined, payment: payment || undefined, planId: planId || undefined, routeId: routeId === "none" ? undefined : routeId || undefined, unrouted: routeId === "none" ? "true" : undefined, fulfilment: fulfilment || undefined, q: dq || undefined, limit: 50 };
  const first = useApi(() => api.tiffin.subscribers(query), [api, key]);
  const [more, setMore] = useState<{ key: string; items: tiffinApi.SubscriberDto[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<tiffinApi.SubscriberDto | null>(null);
  const extra = more?.key === key ? more : null;
  const rows = useMemo(() => [...(first.data?.items ?? []), ...(extra?.items ?? [])], [first.data, extra]);
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await api.tiffin.subscribers({ ...query, cursor });
      setMore({ key, items: [...(extra?.items ?? []), ...r.items], cursor: r.nextCursor });
    } catch {
      /* the list stays as it was; the user can try again */
    } finally {
      setLoadingMore(false);
    }
  };
  const refresh = async () => { setMore(null); await Promise.all([first.reload(), everyone.reload()]); };
  const all = everyone.data?.items ?? [];
  const count = (f: (r: tiffinApi.SubscriberDto) => boolean) => (everyone.data ? all.filter(f).length : null);

  const columns: Column<tiffinApi.SubscriberDto>[] = [
    { key: "name", header: "Subscriber", mobile: "title", sortValue: (r) => r.customer.name ?? "", cell: (r) => <span className="font-medium">{r.customer.name ?? r.customer.phone ?? "Subscriber"}</span> },
    { key: "plan", header: "Plan", mobile: "subtitle", sortValue: (r) => r.plan.name, cell: (r) => `${r.plan.name}` },
    { key: "ful", header: "Meals", mobile: "subtitle", cell: (r) => `${r.servings} × ${r.fulfilment === "delivery" ? (r.routeName ? (r.routeName.split(":")[0] ?? r.routeName).trim() : "delivery") : "pickup"}` },
    { key: "pays", header: "Pays by", mobile: "hidden", sortValue: (r) => r.paymentMethod, cell: (r) => PAY_LABEL[r.paymentMethod] },
    { key: "due", header: "Next due", mobile: "hidden", sortValue: (r) => r.nextBillingDate ?? "", cell: (r) => (r.nextBillingDate && r.status !== "cancelled" ? dayShort(r.nextBillingDate) : "None") },
    { key: "status", header: "Status", mobile: "trailing", sortValue: (r) => r.status, cell: (r) => <StatusWord s={r.status} r={r} /> },
    { key: "open", header: "Details", mobile: "hidden", align: "end", cell: (r) => <button type="button" aria-label={`Open ${r.customer.name ?? "subscriber"}`} onClick={() => setOpen(r)} className="rounded-sm text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring">Open</button> },
  ];
  const filtered = status !== "all" || planId || routeId || fulfilment || payment || dq;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <TextField type="search" label="Search subscribers" hideLabel placeholder="Name, phone, address or postal code" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-10" />
        <div className="hidden items-center text-meta text-fg-muted sm:flex"><Search aria-hidden className="me-1.5 size-3.5" />{rows.length}{cursor ? "+" : ""} shown</div>
      </div>
      <Capsules<StatusFilter>
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "all", label: "All", count: everyone.data ? all.length : null },
          { value: "active", label: "Active", count: count((r) => r.status === "active") },
          { value: "paused", label: "Paused", count: count((r) => r.status === "paused") },
          { value: "awaiting", label: "Awaiting payment", count: count(waiting), tone: "info" },
          { value: "past_due", label: "Past due", count: count((r) => r.status === "past_due"), tone: "negative" },
          { value: "cancelled", label: "Cancelled", count: count((r) => r.status === "cancelled") },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Select label="Pays by" hideLabel value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="Pays by: any" options={(["card", "pad", "etransfer", "cash"] as const).map((m) => ({ value: m, label: PAY_LABEL[m] }))} className="min-h-10" />
        <Select label="Plan" hideLabel value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="All plans" options={(plans.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))} className="min-h-10" />
        <Select label="Route" hideLabel value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="All routes" options={[{ value: "none", label: "Delivery, no route yet" }, ...(routes.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))]} className="min-h-10" />
        <Select label="Delivery or pickup" hideLabel value={fulfilment} onChange={(e) => setFulfilment(e.target.value)} placeholder="Delivery and pickup" options={[{ value: "delivery", label: "Delivery" }, { value: "pickup", label: "Pickup" }]} className="min-h-10" />
      </div>
      {first.status === 402 ? <TierTeaser {...gate} /> : first.status === 403 ? null : (
        <DataTable
          caption="Tiffin subscribers"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={first.loading && !first.data}
          error={first.error && !first.data ? first.error : null}
          onRetry={() => void first.reload()}
          onRowClick={setOpen}
          selectedKey={open?.id}
          hasMore={!!cursor}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
          empty={
            filtered ? (
              <EmptyState title="Nobody matches those filters" description="Try another status or clear the search." action={<Button size="sm" variant="secondary" onClick={() => { setStatus("all"); setPlanId(""); setRouteId(""); setFulfilment(""); setPayment(""); setQ(""); }}>Clear filters</Button>} className="border-0 px-4" />
            ) : (
              <EmptyState title="No subscribers yet" description="They show up here when someone signs up on your tiffin page. Share the link with your regulars first." action={<Button size="sm" onClick={goPlans}>Check your plans</Button>} className="border-0 px-4" />
            )
          }
        />
      )}
      {open ? <SubscriberSheet sub={open} routes={routes.data?.items ?? []} onClose={() => setOpen(null)} onChanged={(s) => { setOpen(s); void refresh(); }} /> : null}
    </div>
  );
}

const CHARGE_TONE: Record<tiffinApi.ChargeDto["status"], [DotTone, string]> = {
  pending: ["info", "Pending"],
  awaiting: ["info", "Awaiting payment"],
  paid: ["positive", "Paid"],
  failed: ["negative", "Failed"],
  refunded: ["neutral", "Refunded"],
};

/** One subscriber's billing periods, newest first: period, amount, skip credit, status and the day it was paid. */
function Charges({ sub, canVoid, onVoided }: { sub: tiffinApi.SubscriberDto; canVoid: boolean; onVoided: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.tiffin.subscriberCharges(sub.id), [api, sub.id, sub.status, sub.currentPeriodStart, sub.awaitingCents]);
  const [voiding, setVoiding] = useState<tiffinApi.ChargeDto | null>(null);
  const [why, setWhy] = useState("");
  const items = state.data?.items ?? [];
  return (
    <Section title="Charges">
      {state.error && !state.data ? (
        <p className="text-meta text-negative">
          Couldn&apos;t load charges.{" "}
          <button type="button" onClick={() => void state.reload()} className="font-medium underline underline-offset-4">Try again</button>
        </p>
      ) : !state.data ? (
        <p className="text-meta text-fg-muted">Loading charges...</p>
      ) : !items.length ? (
        <p className="text-meta text-fg-muted">Nothing billed yet. The first charge appears when they pay at sign-up.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[420px] text-meta">
            <caption className="sr-only">Charges for {sub.customer.name ?? "this subscriber"}</caption>
            <thead>
              <tr className="border-b border-line text-start text-fg-muted">
                <th scope="col" className="py-1.5 pe-2 text-start font-normal">Period</th>
                <th scope="col" className="py-1.5 pe-2 text-end font-normal">Amount</th>
                <th scope="col" className="py-1.5 pe-2 text-end font-normal">Credit</th>
                <th scope="col" className="py-1.5 pe-2 text-start font-normal">Status</th>
                <th scope="col" className="py-1.5 text-end font-normal">Paid</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="py-2 pe-2">{dayShort(c.periodStart)} to {dayShort(c.periodEnd)}</td>
                  <td className="py-2 pe-2 text-end tabular-nums">{formatMoney(c.amountCents)}</td>
                  <td className="py-2 pe-2 text-end tabular-nums text-fg-muted">{c.creditCents ? `-${formatMoney(c.creditCents)}` : "None"}</td>
                  <td className="py-2 pe-2"><Dot tone={CHARGE_TONE[c.status][0]}>{CHARGE_TONE[c.status][1]}</Dot></td>
                  <td className="py-2 text-end tabular-nums text-fg-muted">
                    {c.paidAt ? `${formatDateYear(c.paidAt)}${c.paidMethod && c.paidMethod !== "card" && c.paidMethod !== "pad" ? ` · ${c.paidMethod === "etransfer" ? "e-transfer" : c.paidMethod}` : ""}` : c.referenceCode ? c.referenceCode : "Not yet"}
                    {canVoid && c.status === "paid" && c.paidMethod && c.paidMethod !== "card" && c.paidMethod !== "pad" ? (
                      <button type="button" onClick={() => setVoiding(c)} className="ms-2 rounded-sm text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:focus-ring">Void</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        danger
        title="Void this payment?"
        body="The charge reopens as awaiting payment and the receipt stays in the ledger as voided. Use this for a mistake, such as recording the wrong person."
        confirmLabel="Void payment"
        onConfirm={async () => {
          if (!voiding) return;
          await api.tiffin.voidPayment(voiding.id, why.trim() || "Recorded by mistake");
          toast({ message: "Payment voided. The charge is open again.", tone: "success" });
          setWhy("");
          onVoided();
          void state.reload();
        }}
      >
        <TextField label="Reason" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Recorded the wrong person" />
      </ConfirmDialog>
    </Section>
  );
}

function SubscriberSheet({ sub, routes, onClose, onChanged }: { sub: tiffinApi.SubscriberDto; routes: tiffinApi.RouteDto[]; onClose: () => void; onChanged: (s: tiffinApi.SubscriberDto) => void }) {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [mode, setMode] = useState<"pause" | "skip" | null>(null);
  const [until, setUntil] = useState(addDaysISO(todayISO(), 8));
  const [from, setFrom] = useState("");
  const [skipDay, setSkipDay] = useState(addDaysISO(todayISO(), 2));
  const [skipDays, setSkipDays] = useState<string[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reason, setReason] = useState("");
  const canManage = role === "owner" || role === "manager";
  const live = sub.status === "active" || sub.status === "past_due" || sub.status === "pending";
  const run = async (fn: () => Promise<{ subscriber: tiffinApi.SubscriberDto } | tiffinApi.SubscriberDto>, ok: string) => {
    const r = await act.run(fn);
    if (!r) return;
    toast({ message: ok, tone: "success" });
    setMode(null);
    onChanged("subscriber" in r ? r.subscriber : r);
  };
  const c = sub.customer;
  const awaitingCharge = useApi(() => (sub.awaitingChargeId ? api.tiffin.subscriberCharges(sub.id) : Promise.resolve(null)), [api, sub.id, sub.awaitingChargeId]);
  const due = awaitingCharge.data?.items.find((x) => x.id === sub.awaitingChargeId) ?? null;
  const payee = useApi(() => api.settings.payment(), [api]);
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        label="Subscriber"
        title={c.name ?? c.phone ?? "Subscriber"}
        subtitle={[c.phone, c.email].filter(Boolean).join(" · ")}
        width={480}
      >
        <div className="flex flex-col gap-5">
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusWord s={sub.status} r={sub} />
            {sub.status === "paused" && sub.pausedUntil ? <span className="text-meta text-fg-muted">Back on {dayLabel(sub.pausedUntil)}</span> : null}
          </div>
          {sub.awaitingCents > 0 && due ? (
            <Banner tone="info" action={<Button size="sm" onClick={() => setRecording(true)}>Record payment</Button>}>
              Waiting for {formatMoney(sub.awaitingCents)}{sub.awaitingReferenceCode ? ` (${sub.awaitingReferenceCode})` : ""}. Check your bank, then record it.
            </Banner>
          ) : null}
          <DefList
            items={[
              { label: "Plan", value: sub.plan.name },
              { label: "Days", value: daysText(sub.plan.daysOfWeek) },
              { label: "Servings", value: sub.servings },
              { label: "Delivery or pickup", value: sub.fulfilment === "delivery" ? "Delivery" : "Pickup" },
              ...(sub.fulfilment === "delivery" ? [{ label: "Address", value: [sub.address, sub.postalCode].filter(Boolean).join(", ") || "None" }] : []),
              ...(sub.addressNotes ? [{ label: "Door notes", value: sub.addressNotes }] : []),
              ...(sub.dietaryNotes ? [{ label: "Dietary notes", value: sub.dietaryNotes }] : []),
              { label: "Started", value: dayShort(sub.startDate) },
            ]}
          />
          {sub.fulfilment === "delivery" && canManage ? (
            <Select
              label="Route"
              value={sub.routeId ?? ""}
              placeholder="Not on a route"
              options={routes.map((r) => ({ value: r.id, label: r.name }))}
              onChange={(e) => void run(() => api.tiffin.updateSubscriber(sub.id, { routeId: e.target.value || null }), "Route updated")}
              hint={sub.stopOrder ? `Stop ${sub.stopOrder} on ${sub.routeName}` : "Move stops around in the Deliveries tab"}
            />
          ) : null}
          <Section title="Billing">
            <DefList
              items={[
                { label: `Price per ${sub.plan.cadence === "monthly" ? "month" : "week"}`, value: formatMoney(sub.priceCents) },
                { label: "Pays by", value: PAY_LABEL[sub.paymentMethod] },
                { label: "Current period", value: sub.currentPeriodStart && sub.currentPeriodEnd ? `${dayShort(sub.currentPeriodStart)} to ${dayShort(sub.currentPeriodEnd)}` : "Not started" },
                { label: "Next bill", value: sub.nextBillingDate ? dayLabel(sub.nextBillingDate) : "None scheduled" },
                ...(sub.status === "cancelled" ? [{ label: "Cancelled", value: `${formatDateYear(sub.cancelledAt)}${sub.cancelReason ? `: ${sub.cancelReason}` : ""}` }] : []),
              ]}
            />
            {sub.status === "past_due" ? <p className="mt-2 text-meta text-negative">Last payment failed. Meals are on hold until it goes through; the customer has a retry link.</p> : null}
          </Section>
          <Charges sub={sub} canVoid={canManage} onVoided={() => void api.tiffin.subscriber(sub.id).then(onChanged)} />
          {sub.status !== "cancelled" ? (
            <Section title="On their behalf">
              <div className="flex flex-wrap gap-2">
                {sub.status === "paused" ? (
                  <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void run(() => api.tiffin.resume(sub.id), "Resumed. Meals restart from the next day before cutoff.")} disabled={!canManage}>Resume</Button>
                ) : live ? (
                  <Button size="sm" variant="secondary" onClick={() => setMode(mode === "pause" ? null : "pause")} disabled={!canManage}>Pause</Button>
                ) : null}
                {live ? <Button size="sm" variant="secondary" onClick={() => setMode(mode === "skip" ? null : "skip")}>Skip days</Button> : null}
                {canManage ? <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel subscription</Button> : null}
              </div>
              {mode === "pause" ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField type="date" label="Back on" value={until} min={addDaysISO(todayISO(), 1)} onChange={(e) => setUntil(e.target.value)} hint="First day meals go out again" />
                    <TextField type="date" label="Pause from" optionalLabel value={from} onChange={(e) => setFrom(e.target.value)} hint="Defaults to the first day before cutoff" />
                  </div>
                  <div><Button size="sm" loading={act.busy} disabled={!until} onClick={() => void run(() => api.tiffin.pause(sub.id, { until, ...(from ? { from } : {}) }), "Paused")}>Pause meals</Button></div>
                </div>
              ) : null}
              {mode === "skip" ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><TextField type="date" label="Day to skip" value={skipDay} min={todayISO()} onChange={(e) => setSkipDay(e.target.value)} /></div>
                    <Button size="sm" variant="secondary" className="mb-6" onClick={() => skipDay && !skipDays.includes(skipDay) && setSkipDays([...skipDays, skipDay].sort())}>Add day</Button>
                  </div>
                  {skipDays.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Days to skip">
                      {skipDays.map((d) => (
                        <li key={d}><button type="button" aria-label={`Remove ${dayLabel(d)}`} onClick={() => setSkipDays(skipDays.filter((x) => x !== d))} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-meta hover:bg-bg-subtle focus-visible:focus-ring">{dayLabel(d)} <span aria-hidden>×</span></button></li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-meta text-fg-muted">Skips before the cutoff earn a credit on the next bill. Later ones are just noted for the kitchen.</p>
                  <div><Button size="sm" loading={act.busy} disabled={!skipDays.length} onClick={() => void run(async () => { const r = await api.tiffin.skip(sub.id, { dates: skipDays }); setSkipDays([]); return r; }, "Skipped")}>Skip {skipDays.length || ""} {skipDays.length === 1 ? "day" : "days"}</Button></div>
                </div>
              ) : null}
            </Section>
          ) : null}
        </div>
      </Sheet>
      {recording && due ? (
        <RecordPaymentPanel
          subtitle={`${c.name ?? "Subscriber"} · ${sub.plan.name} · ${sub.servings} ${sub.servings === 1 ? "serving" : "servings"}`}
          rows={[
            { label: "Period", value: `${dayShort(due.periodStart)} to ${dayShort(due.periodEnd)}` },
            { label: "Amount due", value: <strong>{formatMoney(due.remainingCents)}</strong> },
            ...(sub.paymentMethod === "etransfer" && payee.data?.etransferEmail ? [{ label: "Told to send to", value: payee.data.etransferEmail }] : []),
            ...(due.referenceCode ? [{ label: "Reference in message", value: <strong>{due.referenceCode}</strong> }] : []),
          ]}
          amountCents={due.remainingCents}
          defaultMethod={sub.paymentMethod === "cash" ? "cash" : "etransfer"}
          onClose={() => setRecording(false)}
          onRecord={async (body) => {
            const r = await api.tiffin.recordPayment(due.id, body);
            const fresh = await api.tiffin.subscriber(sub.id);
            onChanged(fresh);
            return r;
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        danger
        title={`Cancel ${c.name ?? "this"} subscription?`}
        body="Meals stop and no new bills go out. This can't be undone, though they can sign up again."
        confirmLabel="Cancel subscription"
        onConfirm={async () => {
          const r = await api.tiffin.cancel(sub.id, reason.trim() || undefined);
          toast({ message: "Subscription cancelled", tone: "success" });
          onChanged(r);
        }}
      >
        <TextField label="Reason" optionalLabel placeholder="Moved out of the delivery area" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}

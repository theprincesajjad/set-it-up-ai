"use client";
import { ChevronDown, ChevronUp, Phone, Route as RouteIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { Dot, EmptyState, type DotTone } from "@/components/dashboard/kit";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { DateNav, Loader, copyText, todayISO } from "../common";

const TONE: Record<tiffinApi.TiffinDeliveryStatus, [DotTone, string]> = {
  scheduled: ["neutral", "To go out"],
  out_for_delivery: ["info", "Out for delivery"],
  delivered: ["positive", "Delivered"],
  picked_up: ["positive", "Picked up"],
  missed: ["negative", "Missed"],
  skipped: ["neutral", "Skipped"],
};
/** "Open driver link": makes today's link and opens it in a new tab. */
function DriverLinkButton({ routeId, date }: { routeId: string; date: string }) {
  const { api } = useMerchant();
  const act = useAction();
  return (
    <Button size="sm" variant="secondary" loading={act.busy} onClick={async () => { const r = await act.run(() => api.tiffin.driverLink(routeId, date)); if (r) window.open(r.url, "_blank", "noopener"); }}>
      Open driver link
    </Button>
  );
}
const FINAL: tiffinApi.TiffinDeliveryStatus[] = ["delivered", "picked_up", "skipped"];

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };

/** The day's manifest per route in stop order: bulk mark out / delivered / missed, move stops, auto-assign routes. */
export function DeliveriesTab({ goRoutes, gate }: { goRoutes: () => void; gate: Gate }) {
  const { api } = useMerchant();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const state = useApi(() => api.tiffin.manifest(date), [api, date]);
  const act = useAction();
  const clear = () => setPicked(new Set());
  const markOut = async (routeId?: string) => {
    const r = await act.run(() => api.tiffin.markAllOut({ routeId, date }));
    if (!r) return;
    toast({ message: r.updated ? `${r.updated} ${r.updated === 1 ? "meal" : "meals"} marked out for delivery` : "Nothing left to send out", tone: r.updated ? "success" : "neutral" });
    await state.reload();
  };
  const sendLinks = async () => {
    const ids = (state.data?.routes ?? []).flatMap((r) => (r.route ? [r.route.id] : []));
    if (!ids.length) return;
    const r = await act.run(() => api.tiffin.sendDriverLinks(ids, "whatsapp", date));
    if (!r) return;
    const why = r.skipped[0]?.reason === "quiet_hours" ? "It's quiet hours (9 pm to 8 am), so nothing was sent." : "Add a driver phone on the Routes tab to send it.";
    toast({ message: r.sent.length ? `Sent ${r.sent.length} driver ${r.sent.length === 1 ? "link" : "links"}${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}` : why, tone: r.sent.length ? "success" : "neutral" });
  };

  const setStatus = async (status: "out_for_delivery" | "delivered" | "picked_up" | "missed", ids = [...picked]) => {
    if (!ids.length) return;
    const r = await act.run(() => api.tiffin.setDeliveryStatus({ ids, status }));
    if (!r) return;
    toast({ message: r.ignored.length ? `${r.updated} updated, ${r.ignored.length} left alone (already done or skipped)` : `${r.updated} updated`, tone: "success" });
    clear();
    await state.reload();
  };
  const autoAssign = async () => {
    const r = await act.run(() => api.tiffin.autoAssign(true));
    if (!r) return;
    toast({ message: r.assigned ? `${r.assigned} ${r.assigned === 1 ? "subscriber" : "subscribers"} put on routes by postal code` : "Nobody new to assign. Routes match on postal code prefixes.", tone: r.assigned ? "success" : "neutral" });
    await state.reload();
  };
  const move = async (route: tiffinApi.ManifestRoute, index: number, dir: -1 | 1) => {
    if (!route.route) return;
    const ids = route.stops.map((s) => s.subscriptionId);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    const r = await act.run(() => api.tiffin.reorderStops(route.route!.id, ids));
    if (r) await state.reload();
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (stops: tiffinApi.ManifestStop[]) => setPicked((s) => {
    const open = stops.filter((x) => !FINAL.includes(x.status)).map((x) => x.deliveryId);
    const all = open.every((id) => s.has(id));
    const n = new Set(s);
    for (const id of open) { if (all) n.delete(id); else n.add(id); }
    return n;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav label="Delivery day" value={date} onChange={(d) => { setDate(d); clear(); }} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" iconStart={RouteIcon} loading={act.busy} onClick={() => void autoAssign()}>
            Auto-assign routes
          </Button>
          <Button size="sm" loading={act.busy} onClick={() => void sendLinks()} disabled={!state.data?.routes.some((r) => r.route)}>
            Send driver links
          </Button>
        </div>
      </div>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Loader state={state} gate={gate} rows={5}>
        {(d) => {
          const total = d.routes.reduce((n, r) => n + r.stops.length, 0) + d.pickups.length;
          if (!total)
            return (
              <EmptyState
                title="No deliveries on this day"
                description="Meals show up here once subscribers have a plan running. Set up routes so each driver gets a stop list in order."
                action={<Button size="sm" onClick={goRoutes}>Set up a route</Button>}
              />
            );
          return (
            <div className="grid gap-8 pb-16 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-8">
                {d.routes.map((r) => (
                  <Run key={r.route?.id ?? "none"} r={r} date={date} onMarkOut={r.route ? () => void markOut(r.route!.id) : undefined} picked={picked} toggle={toggle} toggleAll={() => toggleAll(r.stops)} move={(i, dir) => void move(r, i, dir)} busy={act.busy} />
                ))}
                {d.pickups.length ? <Run r={{ route: null, stops: d.pickups }} date={date} pickup picked={picked} toggle={toggle} toggleAll={() => toggleAll(d.pickups)} busy={act.busy} /> : null}
              </div>
              <DriverRail routes={d.routes.flatMap((r) => (r.route ? [r.route] : []))} date={date} onSent={() => void state.reload()} />
            </div>
          );
        }}
      </Loader>
      {picked.size ? (
        <div role="region" aria-label="Bulk actions" className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-bg px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-8 lg:start-[240px] print:hidden">
          <div className="mx-auto flex max-w-[1136px] flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-fg" aria-live="polite">{picked.size} {picked.size === 1 ? "stop" : "stops"} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
              <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void setStatus("out_for_delivery")}>Out for delivery</Button>
              <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void setStatus("missed")}>Missed</Button>
              <Button size="sm" loading={act.busy} onClick={() => void setStatus(state.data?.pickups.some((p) => picked.has(p.deliveryId)) ? "picked_up" : "delivered")}>
                {state.data?.pickups.some((p) => picked.has(p.deliveryId)) ? "Picked up" : "Delivered"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Driver link (open, send, copy) and the "running late" notice for the day (design T3). */
function DriverRail({ routes, date }: { routes: NonNullable<tiffinApi.ManifestRoute["route"]>[]; date: string; onSent: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [routeId, setRouteId] = useState("");
  const [link, setLink] = useState<{ routeId: string; url: string } | null>(null);
  const [minutes, setMinutes] = useState("20");
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  if (!route) return null;
  const url = link?.routeId === route.id ? link.url : null;
  const make = async () => {
    const r = await act.run(() => api.tiffin.driverLink(route.id, date));
    if (r) setLink({ routeId: route.id, url: r.url });
    return r?.url ?? null;
  };
  return (
    <aside className="flex min-w-0 flex-col gap-4 print:hidden" aria-label="Driver link and late run">
      <section className="rounded-card bg-card shadow-card p-5">
        <h3 className="text-headline text-fg">Driver link</h3>
        <p className="mt-1 text-meta text-fg-muted">{route.driverName ?? "The driver"} opens this on a phone. No login, no app install, expires at midnight.</p>
        {routes.length > 1 ? <Select label="Route" hideLabel className="mt-3" value={route.id} onChange={(e) => setRouteId(e.target.value)} options={routes.map((r) => ({ value: r.id, label: r.name }))} /> : <p className="mt-3 text-meta-strong text-fg">{route.name}</p>}
        {url ? <p className="mt-2 break-all rounded-input bg-bg-subtle px-3 py-2 text-meta text-fg-muted">{url.replace(/^https?:\/\//, "")}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {url ? (
            <>
              <Button size="sm" onClick={async () => { const ok = await act.run(() => api.tiffin.sendDriverLinks([route.id], "whatsapp", date)); if (ok) toast({ message: ok.sent.length ? "Sent to the driver" : ok.skipped[0]?.reason === "no_phone" ? "Add the driver's phone on the Routes tab first" : "Not sent: quiet hours", tone: ok.sent.length ? "success" : "neutral" }); }}>Send on WhatsApp</Button>
              <Button size="sm" variant="secondary" onClick={async () => toast({ message: (await copyText(url)) ? "Link copied" : "Couldn't copy. Select the link and copy it.", tone: "neutral" })}>Copy</Button>
            </>
          ) : (
            <Button size="sm" loading={act.busy} onClick={() => void make()}>Create link</Button>
          )}
        </div>
        {act.error ? <p className="mt-2 text-meta text-negative">{act.error}</p> : null}
      </section>
      <section className="rounded-card bg-card shadow-card p-5">
        <h3 className="text-headline text-fg">Late run</h3>
        <p className="mt-1 text-meta text-fg-muted">Texts &quot;running {minutes} minutes late&quot; to every stop still to go.</p>
        <div className="mt-3 flex items-end gap-2">
          <div className="w-24"><TextField label="Minutes" hideLabel inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} suffix="min" /></div>
          <Button size="sm" variant="secondary" loading={act.busy} disabled={Number(minutes) < 5} onClick={async () => { const r = await act.run(() => api.tiffin.lateNotice({ minutes: Number(minutes), date })); if (r) toast({ message: r.notified ? `Told ${r.notified} ${r.notified === 1 ? "stop" : "stops"}` : "Nobody left to tell", tone: r.notified ? "success" : "neutral" }); }}>Send late notice</Button>
        </div>
      </section>
    </aside>
  );
}

function Run({ r, date, onMarkOut, pickup, picked, toggle, toggleAll, move, busy }: { r: tiffinApi.ManifestRoute; date: string; onMarkOut?: () => void; pickup?: boolean; picked: Set<string>; toggle: (id: string) => void; toggleAll: () => void; move?: (index: number, dir: -1 | 1) => void; busy: boolean }) {
  const stops = useMemo(() => r.stops, [r.stops]);
  const open = stops.filter((s) => !FINAL.includes(s.status)).length;
  const title = pickup ? "Pickup at the counter" : (r.route?.name ?? "Not on a route yet");
  const meals = stops.reduce((n, s) => n + (s.status === "skipped" ? 0 : s.servings), 0);
  return (
    <section aria-label={title} className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
        <div className="min-w-0">
          <h3 className="text-body-strong text-fg">{title}</h3>
          <p className="text-meta text-fg-muted">
            {stops.length} {stops.length === 1 ? "stop" : "stops"} · {meals} {meals === 1 ? "tiffin" : "tiffins"}
            {r.route?.driverName ? ` · ${r.route.driverName}` : ""}
            {!pickup && !r.route ? ". Auto-assign matches them by postal code." : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {r.route?.driverPhone ? (
            <a href={`tel:${r.route.driverPhone}`} className="inline-flex items-center gap-1 text-meta text-fg-muted hover:text-fg">
              <Phone aria-hidden className="size-3.5" /> {r.route.driverPhone}
            </a>
          ) : null}
          {open ? (
            <button type="button" onClick={toggleAll} className="rounded-sm text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring">
              Select open
            </button>
          ) : null}
          {r.route ? (
            <>
              <DriverLinkButton routeId={r.route.id} date={date} />
              {onMarkOut ? <Button size="sm" variant="secondary" disabled={busy || !stops.some((s) => s.status === "scheduled")} onClick={onMarkOut}>Mark all out</Button> : null}
            </>
          ) : null}
        </div>
      </div>
      <ol>
        {stops.map((s, i) => {
          const [tone, word] = TONE[s.status];
          const done = FINAL.includes(s.status);
          return (
            <li key={s.deliveryId} className="flex items-start gap-3 border-b border-line py-3">
              <input
                type="checkbox"
                aria-label={`Select ${s.customerName ?? "stop"}`}
                disabled={done}
                checked={picked.has(s.deliveryId)}
                onChange={() => toggle(s.deliveryId)}
                className="mt-1 size-5 shrink-0 accent-[var(--ll-color-fg)]"
              />
              <span className="mt-0.5 w-6 shrink-0 text-end text-meta tabular text-fg-muted">{pickup ? "" : (s.stopOrder ?? i + 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className={cn("text-body text-fg", s.status === "skipped" && "text-fg-muted line-through")}>{s.customerName ?? "Subscriber"}</span>
                  <span className="text-meta tabular text-fg-muted">{s.servings} × {s.planName}</span>
                </div>
                {!pickup ? <p className="text-meta text-fg-muted">{[s.address, s.postalCode].filter(Boolean).join(", ") || "No address on file"}</p> : null}
                {s.addressNotes ? <p className="text-meta text-fg-muted">Door: {s.addressNotes}</p> : null}
                {s.dietaryNotes ? <p className="text-meta text-fg">Diet: {s.dietaryNotes}</p> : null}
                {s.note ? <p className="text-meta text-fg-muted">Note: {s.note}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Dot tone={tone}>{word}{s.deliveredAt ? ` ${formatTime(s.deliveredAt)}` : ""}</Dot>
                  {s.customerPhone ? (
                    <a href={`tel:${s.customerPhone}`} className="inline-flex items-center gap-1 text-meta text-fg-muted hover:text-fg">
                      <Phone aria-hidden className="size-3" /> {s.customerPhone}
                    </a>
                  ) : null}
                </div>
              </div>
              {move && r.route ? (
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label={`Move ${s.customerName ?? "stop"} earlier`} disabled={busy || i === 0} onClick={() => move(i, -1)} className="inline-flex size-8 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-subtle hover:text-fg disabled:opacity-30 focus-visible:focus-ring">
                    <ChevronUp aria-hidden className="size-4" />
                  </button>
                  <button type="button" aria-label={`Move ${s.customerName ?? "stop"} later`} disabled={busy || i === stops.length - 1} onClick={() => move(i, 1)} className="inline-flex size-8 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-subtle hover:text-fg disabled:opacity-30 focus-visible:focus-ring">
                    <ChevronDown aria-hidden className="size-4" />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

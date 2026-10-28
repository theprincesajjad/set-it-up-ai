"use client";
/**
 * Restaurant Home (docs/research/desi-restaurants.md, frame 01): what the kitchen needs today. Open orders, wait, sales and
 * the commission-avoided estimate in one block; coming up (pots, events, the next festival for your community); orders by
 * channel; the needs-you list; the kitchen right now; and busy mode.
 * Accent is for the one thing that needs the shop now (new orders). Late is red, waiting on a guest is blue.
 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { EmptyState, ErrorLine, PageHeader, StatBlock, Tag } from "../kit";
import { useMerchant } from "../MerchantContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { firstName, formatMoney, formatNumber } from "@/lib/format";
import { greeting } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Home = restaurantApi.RestaurantHomeResponse;

const CHANNEL_LABEL: Record<string, string> = { counter: "Counter", phone: "Phone", whatsapp: "WhatsApp", web: "Web link and QR", app: "App" };
const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

const longToday = (today: string) => new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`));

/** "SAT" over "24" for a shop-local YYYY-MM-DD. */
export function dayBlock(date: string): { dow: string; day: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return { dow: new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" }).format(d).toUpperCase(), day: String(d.getUTCDate()).padStart(2, "0") };
}

export function RestaurantHome() {
  const { api, base, me } = useMerchant();
  const home = useApi(() => api.restaurantHome(), [api], { pollMs: 30_000 });
  const name = me.user.name ? firstName(me.user.name) : null;
  const d = home.data;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={name ? `${greeting()}, ${name}` : greeting()}
        description={d ? [longToday(d.today), d.closesAt ? `open until ${d.closesAt}` : null, `${plural(d.orders.open, "order")} open`].filter(Boolean).join(" · ") : " "}
        actions={
          <>
            <BusyMode state={d?.busy ?? null} onChanged={() => void home.reload()} />
            <Button size="md" href={`${base}/counter`} className="h-[38px] rounded-[10px] px-4 text-[14px] font-medium">
              Open counter
            </Button>
          </>
        }
        flush
      />

      {home.error && !d ? <div className="mt-6"><ErrorLine message={home.error} onRetry={() => void home.reload()} /></div> : null}

      <div className="mt-6">
        <StatBlock
          label="Today at a glance"
          loading={home.loading && !d}
          items={[
            {
              label: "Open orders",
              value: d ? formatNumber(d.orders.open) : "–",
              caption: d ? <OrderSplit o={d.orders} /> : undefined,
              href: `${base}/orders`,
            },
            { label: "Average wait", value: d ? (d.avgWaitMin == null ? "–" : `${d.avgWaitMin} min`) : "–", caption: d ? `Quoted ${d.quotedWaitMin} min at the counter${d.busy.on ? ` (busy mode +${d.busy.addMinutes})` : ""}` : undefined },
            {
              label: "Sales today",
              value: d ? formatMoney(d.salesTodayCents) : "–",
              delta: d && d.salesVsLastSameWeekdayPct != null ? { good: d.salesVsLastSameWeekdayPct > 0 ? true : d.salesVsLastSameWeekdayPct < 0 ? false : null, text: `${d.salesVsLastSameWeekdayPct > 999 ? "Well up" : `${d.salesVsLastSameWeekdayPct > 0 ? "+" : ""}${d.salesVsLastSameWeekdayPct}%`} vs last ${new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" }).format(new Date(`${d.today}T12:00:00Z`))}` } : null,
              caption: d ? "Orders placed so far today" : undefined,
            },
            { label: "Commission avoided", value: d ? formatMoney(d.directSavings.cents) : "–", caption: d ? <Estimate s={d.directSavings} /> : undefined },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <ComingUp rows={d?.comingUp ?? null} loading={home.loading && !d} />
          <Channels rows={d?.channels ?? null} loading={home.loading && !d} />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <NeedsYou rows={d?.needsYou ?? null} loading={home.loading && !d} />
          <KitchenNow o={d?.orders ?? null} />
        </div>
      </div>
    </div>
  );
}

/** "3 new, 4 cooking, 2 ready": only "new" is accent. */
function OrderSplit({ o }: { o: Home["orders"] }) {
  if (!o.open) return <>Nothing open right now</>;
  return (
    <>
      <span className="text-points-text">{o.new} new</span>, {o.preparing} cooking, {o.ready} ready
    </>
  );
}

/** The estimate and its inputs, so nobody mistakes it for a measured saving. */
function Estimate({ s }: { s: Home["directSavings"] }) {
  if (!s.directOrders) return <>Estimate: no direct orders in the last {s.periodDays} days yet</>;
  return (
    <>
      Estimate: {s.directOrders} direct {s.directOrders === 1 ? "order" : "orders"} in {s.periodDays} days, {formatMoney(s.avgTicketCents)} each, {Math.round(s.assumedFeeBps / 100)}% app fee
    </>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {sub ? <p className="mt-0.5 text-[13px] text-fg-muted">{sub}</p> : null}
    </div>
  );
}

const box = "overflow-hidden rounded-card border border-line";

function ComingUp({ rows, loading }: { rows: Home["comingUp"] | null; loading: boolean }) {
  const { base } = useMerchant();
  return (
    <section aria-labelledby="coming-h">
      <div className="mb-3">
        <h2 id="coming-h" className="text-[15px] font-semibold text-fg">Coming up</h2>
        <p className="mt-0.5 text-[13px] text-fg-muted">Pots to cook, events to host and the festival to tell regulars about</p>
      </div>
      {loading ? (
        <div className="skeleton h-40 w-full rounded-card" />
      ) : !rows?.length ? (
        <EmptyState title="Nothing booked for the next two days" description="Pre-orders, catering and festivals show up here as they come in." action={<Button size="sm" variant="secondary" href={`${base}/restaurant/preorders`}>Open pre-orders</Button>} />
      ) : (
        <ul className={cn(box, "divide-y divide-line")}>
          {rows.map((r, i) => (
            <li key={`${r.kind}-${r.date}-${i}`}>
              <div className="flex items-center gap-5 px-5 py-3.5">
                <DateCell date={r.date} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-fg">{r.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{r.sub}</p>
                </div>
                <Trailing row={r} href={r.href ? `${base}${r.href}` : undefined} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DateCell({ date }: { date: string }) {
  const { dow, day } = dayBlock(date);
  return (
    <div className="w-9 shrink-0 text-center sm:w-10">
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{dow}</p>
      <p className="text-[22px] font-semibold leading-6 text-fg tabular">{day}</p>
    </div>
  );
}

function Trailing({ row, href }: { row: restaurantApi.ComingUpRow; href?: string }) {
  if (row.kind === "preorder" && row.cap != null) {
    const pct = Math.min(100, Math.round(((row.pots ?? 0) / Math.max(1, row.cap)) * 100));
    return (
      <Link href={href ?? "#"} className="hidden w-[150px] shrink-0 sm:block focus-visible:focus-ring" aria-label={`${row.pots} of ${row.cap} pots booked`}>
        <p className="text-end text-[13px] font-medium text-fg tabular">{row.pots} of {row.cap} pots</p>
        <span aria-hidden className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-bg-muted">
          <span className="block h-full rounded-full bg-trade" style={{ width: `${pct}%` }} />
        </span>
      </Link>
    );
  }
  if (row.kind === "festival") {
    return (
      <Button size="sm" variant="secondary" href={href}>
        Review message
      </Button>
    );
  }
  return row.tag ? <Tag className="hidden sm:inline-flex">{row.tag}</Tag> : href ? <Link href={href} aria-label="Open" className="text-fg-muted"><ChevronRight aria-hidden className="size-4" /></Link> : null;
}

function Channels({ rows, loading }: { rows: Home["channels"] | null; loading: boolean }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.count));
  return (
    <section aria-labelledby="chan-h">
      <div className="mb-3">
        <h2 id="chan-h" className="text-[15px] font-semibold text-fg">Orders by channel today</h2>
        <p className="mt-0.5 text-[13px] text-fg-muted">Where today&apos;s orders came from</p>
      </div>
      {loading ? (
        <div className="skeleton h-40 w-full rounded-card" />
      ) : !rows?.length ? (
        <p className={cn(box, "px-5 py-4 text-[14px] text-fg-muted")}>No orders yet today. They are counted here as they come in.</p>
      ) : (
        <ul className={cn(box, "divide-y divide-line")}>
          {rows.map((r) => (
            <li key={r.channel} className="flex items-center gap-4 px-5 py-3 text-[14px]">
              <span className="w-[110px] shrink-0 text-fg sm:w-[150px]">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
              <span aria-hidden className="h-[3px] flex-1 overflow-hidden rounded-full bg-bg-muted">
                <span className="block h-full rounded-full bg-trade" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
              </span>
              <span className="w-8 shrink-0 text-end font-medium text-fg tabular">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TONE_DOT = { accent: "bg-points", negative: "bg-negative", info: "bg-location" } as const;

function NeedsYou({ rows, loading }: { rows: Home["needsYou"] | null; loading: boolean }) {
  const { base } = useMerchant();
  return (
    <section aria-labelledby="needs-h">
      <Heading title="Needs you" />
      {loading ? (
        <div className="skeleton h-40 w-full rounded-card" />
      ) : !rows?.length ? (
        <p className={cn(box, "px-5 py-4 text-[14px] text-fg-muted")}>Nothing needs you right now.</p>
      ) : (
        <ul aria-label="Needs you" className={cn(box, "divide-y divide-line")}>
          {rows.map((r) => (
            <li key={r.kind}>
              <Link href={`${base}${r.href}`} className="flex items-center gap-3 px-5 py-3.5 text-[14px] text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[r.tone])} />
                <span className="min-w-0 flex-1">{r.text}</span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KitchenNow({ o }: { o: Home["orders"] | null }) {
  const { base, enabled } = useMerchant();
  const kds = enabled("restaurant.kds");
  const cell = (label: string, n: number | undefined) => (
    <div className="bg-bg px-5 py-4">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="mt-1 text-[30px] font-semibold leading-9 text-fg tabular">{n ?? "–"}</dd>
    </div>
  );
  return (
    <section aria-labelledby="kit-h">
      <Heading title="Kitchen right now" />
      <dl aria-label="Kitchen right now" className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line">
        {cell("New", o?.new)}
        {cell("Cooking", o?.preparing)}
        {cell("Ready", o?.ready)}
      </dl>
      <Button variant="secondary" size="md" href={kds ? `${base}/restaurant/kitchen` : `${base}/orders`} className="mt-3 w-full justify-center">
        {kds ? "Open kitchen display" : "Open orders"}
      </Button>
    </section>
  );
}

/** "Busy mode: add 15 min" / "Busy mode: off". Adds minutes to every quoted wait for two hours. */
export function BusyMode({ state, onChanged }: { state: restaurantApi.BusyState | null; onChanged: () => void }) {
  const { api } = useMerchant();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const on = !!state?.on;
  const set = async (addMinutes: restaurantApi.BusyBody["addMinutes"]) => {
    const r = await act.run(() => api.busy.set({ addMinutes }));
    if (r) {
      setOpen(false);
      onChanged();
    }
  };
  const until = state?.until ? new Date(state.until).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[38px] items-center rounded-full border border-line bg-bg px-4 text-[14px] font-medium text-fg hover:bg-bg-subtle focus-visible:focus-ring"
      >
        {on ? `Busy mode: add ${state!.addMinutes} min` : "Busy mode: off"}
      </button>
      {open ? (
        <div role="menu" aria-label="Busy mode" className="absolute end-0 top-11 z-popover w-[260px] rounded-input border border-line bg-bg p-1.5 shadow-float">
          <p className="px-2 pb-1 pt-1.5 text-[12px] text-fg-muted">Add to every quoted wait for two hours</p>
          {restaurantBusyOptions.map((m) => (
            <button key={m} type="button" role="menuitemradio" aria-checked={on && state!.addMinutes === m} disabled={act.busy} onClick={() => void set(m)} className="flex h-9 w-full items-center justify-between rounded-[8px] px-2 text-start text-[14px] text-fg hover:bg-bg-subtle disabled:opacity-60">
              <span>Add {m} min</span>
              {on && state!.addMinutes === m ? <span className="text-[12px] text-fg-muted">until {until}</span> : null}
            </button>
          ))}
          <button type="button" role="menuitemradio" aria-checked={!on} disabled={act.busy || !on} onClick={() => void set(0)} className="flex h-9 w-full items-center rounded-[8px] px-2 text-start text-[14px] text-fg hover:bg-bg-subtle disabled:opacity-50">
            Turn off
          </button>
          {act.error ? <p role="alert" className="px-2 pb-1.5 pt-1 text-[12px] text-negative">{act.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

const restaurantBusyOptions = [10, 15, 20, 30] as const satisfies readonly restaurantApi.BusyBody["addMinutes"][];

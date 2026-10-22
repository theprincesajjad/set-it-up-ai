"use client";
import { Check, ChefHat, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCALES, translator, type MessageKey, type restaurantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { torontoHM } from "@/components/dashboard/restaurant/common";
import { OrderBadges } from "@/components/dashboard/restaurant/orderBadges";
import { stationLabel } from "@/components/dashboard/restaurant/menu";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/dashboard/useApi";

type Ticket = restaurantApi.KitchenTicketDto;
type Item = restaurantApi.KitchenItemDto;
type Lang = restaurantApi.MenuLang;

const MENU_LANGS = ["en", "hi", "ur", "pa"] as const satisfies readonly Lang[];
const POLL_MS = 5000;
/** A ticket older than this turns accent (seconds). */
export const LATE_AFTER_S = 10 * 60;
const COLUMNS = [
  { id: "new", key: "kitchen.new" },
  { id: "cooking", key: "kitchen.cooking" },
  { id: "ready", key: "kitchen.ready" },
] as const;
type ColumnId = (typeof COLUMNS)[number]["id"];

const columnOf = (t: Ticket): ColumnId => {
  if (t.items.every((i) => i.status === "ready")) return "ready";
  if (t.items.some((i) => i.status !== "queued")) return "cooking";
  return "new";
};
/** "tandoor" in the ticket language when we have the word, else the shop's own text. */
const stationIn = (tr: ReturnType<typeof translator>, s: string) => {
  const key = `station.${s}` as MessageKey;
  const word = tr(key);
  return word === key || word.startsWith("station.") ? stationLabel(s) : word;
};
const NEXT: Record<Item["status"], "cooking" | "ready" | null> = { queued: "cooking", cooking: "ready", ready: null };

export function ageText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function KitchenBoard() {
  const { api, base, detail } = useMerchant();
  const sp = useSearchParams();
  const initialLang = (MENU_LANGS as readonly string[]).includes(sp.get("lang") ?? "") ? (sp.get("lang") as Lang) : undefined;
  const [station, setStation] = useState<string>(sp.get("station") ?? "all");
  const [lang, setLang] = useState<Lang | undefined>(initialLang);
  // `at` is when the poll landed: ticket ages are counted forward from it so the timers tick without extra requests.
  const state = useApi(async () => ({ res: await api.kitchen.tickets({ station, ...(lang ? { lang } : {}) }), at: Date.now() }), [api, station, lang], { pollMs: POLL_MS });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<{ orderId: string; number: number }[]>([]);
  const [full, setFull] = useState(false);

  // Age is computed from when each poll landed, so the timers tick every second without extra requests.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  // Lock page scroll behind the board.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const data = state.data?.res ?? null;
  const fetchedAt = state.data?.at ?? tick;
  const shownLang: Lang = lang ?? data?.lang ?? "en";
  const dir = LOCALES[shownLang].dir;
  const tr = useMemo(() => translator(shownLang), [shownLang]);
  const tickets = useMemo(() => data?.items ?? [], [data]);
  const ageOf = (t: Ticket) => t.ageSeconds + Math.max(0, (tick - fetchedAt) / 1000);

  const withBusy = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy((b) => new Set(b).add(key));
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
      await state.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reload]);

  const advance = (t: Ticket, i: Item) => {
    const next = NEXT[i.status];
    if (!next) return;
    // Show the change at once; the next poll confirms it.
    state.setData((d) => (d ? { ...d, res: { ...d.res, items: d.res.items.map((x) => (x.orderId === t.orderId ? { ...x, items: x.items.map((y) => (y.id === i.id ? { ...y, status: next } : y)) } : x)) } } : d));
    void withBusy(i.id, () => api.kitchen.setItem(i.id, next));
  };
  const bump = (t: Ticket) => {
    state.setData((d) => (d ? { ...d, res: { ...d.res, items: d.res.items.filter((x) => x.orderId !== t.orderId) } } : d));
    setRecent((r) => [{ orderId: t.orderId, number: t.number }, ...r.filter((x) => x.orderId !== t.orderId)].slice(0, 5));
    void withBusy(t.orderId, () => api.kitchen.bump(t.orderId));
  };
  const recall = (r: { orderId: string }) => {
    setRecent((x) => x.filter((y) => y.orderId !== r.orderId));
    void withBusy(r.orderId, () => api.kitchen.recall(r.orderId));
  };

  const cols = useMemo(() => COLUMNS.map((c) => ({ ...c, tickets: tickets.filter((t) => columnOf(t) === c.id) })), [tickets]);
  const lateCount = tickets.filter((t) => ageOf(t) >= LATE_AFTER_S).length;
  const stations = data?.stations ?? [];

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-bg-subtle text-fg" role="region" aria-label="Kitchen display">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-3 md:px-6">
        <Link href={base} className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-4 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
          <X aria-hidden className="size-4" />
          Exit
        </Link>
        <div className="min-w-0">
          <h1 className="display truncate text-headline leading-tight text-fg">kitchen</h1>
          <p className="truncate text-caption text-fg-muted">
            {detail.merchant.name} · {tickets.length} open{lateCount ? ` · ${lateCount} late` : ""}
          </p>
        </div>

        <nav aria-label="Station" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0">
          {["all", ...stations].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={station === s}
              onClick={() => setStation(s)}
              className={cn("inline-flex h-12 shrink-0 items-center rounded-full border px-5 text-body-strong transition-colors focus-visible:focus-ring", station === s ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
            >
              {s === "all" ? "All" : stationIn(tr, s)}
            </button>
          ))}
          {station !== "all" && !stations.includes(station) ? (
            <span className="inline-flex h-12 shrink-0 items-center rounded-full border border-fg bg-fg px-5 text-body-strong text-bg">{stationLabel(station)}</span>
          ) : null}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <div role="group" aria-label="Ticket language" className="flex rounded-full border border-line bg-bg p-1">
            {MENU_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={LOCALES[l].bcp47}
                aria-pressed={shownLang === l}
                onClick={() => setLang(l)}
                className={cn("inline-flex h-10 min-w-12 items-center justify-center rounded-full px-3 text-meta-strong focus-visible:focus-ring", shownLang === l ? "bg-fg text-bg" : "text-fg hover:bg-bg-subtle")}
              >
                {LOCALES[l].short}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={full ? "Leave full screen" : "Full screen"}
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined))}
            className="hidden size-12 items-center justify-center rounded-full border border-line bg-bg hover:bg-bg-subtle focus-visible:focus-ring sm:inline-flex"
          >
            {full ? <Minimize2 aria-hidden className="size-5" /> : <Maximize2 aria-hidden className="size-5" />}
          </button>
        </div>
      </header>

      {error || (state.error && !state.data) ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-line bg-bg px-4 py-2 text-meta md:px-6">
          <span className="text-negative">{error ?? state.error}</span>
          <button type="button" onClick={() => { setError(null); void state.reload(); }} className="h-9 rounded-full px-3 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
            Try again
          </button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
        {!data ? (
          <p className="p-6 text-body text-fg-muted">{state.error ? "" : "Loading tickets..."}</p>
        ) : !tickets.length ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <ChefHat aria-hidden className="size-10 text-fg-subtle" strokeWidth={1.5} />
            <p className="display text-title text-fg">{tr("kitchen.noTickets").replace(/\.$/, "").toLowerCase()}</p>
            <p className="max-w-sm text-body text-fg-muted">New orders show up here the moment they are paid or placed. This screen checks every {POLL_MS / 1000} seconds.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:h-full md:grid-cols-3 md:gap-0 md:p-0">
            {cols.map((c) => (
              <section key={c.id} aria-label={`${tr(c.key)} tickets`} className={cn("flex min-h-0 min-w-0 flex-col md:border-s md:border-line md:first:border-s-0", !c.tickets.length && "max-md:hidden")}>
                <h2 className="flex items-baseline justify-between gap-2 px-1 py-0 text-meta-strong uppercase tracking-wide text-fg-muted md:border-b md:border-line md:bg-bg md:px-5 md:py-3">
                  <span>
                    {tr(c.key)} <span className="tabular text-fg">{c.tickets.length}</span>
                  </span>
                </h2>
                <ul className="flex min-h-0 flex-col gap-3 pt-2 md:flex-1 md:overflow-y-auto md:p-3">
                  {c.tickets.map((t) => (
                    <li key={t.orderId}>
                      <TicketCard ticket={t} age={ageOf(t)} lang={shownLang} dir={dir} tr={tr} busy={busy} onAdvance={advance} onBump={bump} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {recent.length ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-bg px-4 py-2 md:px-6">
          <p className="me-1 text-meta text-fg-muted">Just bumped</p>
          {recent.map((r) => (
            <button key={r.orderId} type="button" onClick={() => recall(r)} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
              <RotateCcw aria-hidden className="size-4" />
              Recall #{r.number}
            </button>
          ))}
        </footer>
      ) : null}
    </div>
  );
}

function TicketCard({ ticket: t, age, lang, dir, tr, busy, onAdvance, onBump }: { ticket: Ticket; age: number; lang: Lang; dir: "ltr" | "rtl"; tr: ReturnType<typeof translator>; busy: Set<string>; onAdvance: (t: Ticket, i: Item) => void; onBump: (t: Ticket) => void }) {
  const late = age >= LATE_AFTER_S;
  const allReady = t.items.every((i) => i.status === "ready");
  const done = t.items.filter((i) => i.status === "ready").length;
  return (
    <article aria-label={`Ticket ${t.number}`} className={cn("overflow-hidden rounded-card border-2 bg-bg", late ? "border-accent" : "border-fg")}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="display text-[32px] leading-none text-fg tabular">#{t.number}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <OrderBadges kind={t.kind} channel={t.channel} />
            {t.pickupAt ? <span className="text-meta text-fg-muted tabular">Pickup {torontoHM(t.pickupAt)}</span> : null}
          </div>
        </div>
        <p
          className={cn("shrink-0 rounded-full px-3 py-1 text-title tabular", late ? "bg-accent-soft font-bold text-accent-text" : "bg-bg-subtle font-semibold text-fg")}
          aria-label={`${Math.floor(age / 60)} minutes${late ? ", late" : ""}`}
        >
          {ageText(age)}
        </p>
      </header>
      <ul>
        {t.items.map((i) => {
          const next = NEXT[i.status];
          return (
            <li key={i.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                disabled={!next || busy.has(i.id)}
                onClick={() => onAdvance(t, i)}
                aria-label={`${i.quantity} ${i.name}, ${i.status === "queued" ? "new" : i.status}${next ? `. Tap to mark ${next}` : ""}`}
                className={cn(
                  "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-start transition-colors focus-visible:focus-ring disabled:cursor-default",
                  i.status === "ready" ? "bg-bg-subtle text-fg-muted" : "bg-bg hover:bg-bg-subtle active:bg-bg-muted",
                )}
              >
                <span className="w-10 shrink-0 text-center text-[28px] font-bold leading-none tabular">{i.quantity}×</span>
                <span className="min-w-0 flex-1" lang={LOCALES[lang].bcp47} dir={dir}>
                  <span className={cn("block text-[19px] font-semibold leading-snug", i.status === "ready" && "line-through decoration-2")}>{i.name}</span>
                  {i.name !== i.nameEn ? <span lang="en" dir="ltr" className="block text-caption text-fg-muted">{i.nameEn}</span> : null}
                  {i.modifiers.length ? <span className="block text-meta text-fg-muted">{i.modifiers.map((m) => m.option).join(", ")}</span> : null}
                  {i.notes ? <span className="mt-0.5 block rounded-sm bg-bg-muted px-1.5 py-0.5 text-meta font-medium text-fg">{i.notes}</span> : null}
                </span>
                <StatusChip status={i.status} tr={tr} />
              </button>
            </li>
          );
        })}
      </ul>
      {t.notes ? <p className="border-t border-line bg-bg-subtle px-4 py-2 text-meta font-medium text-fg">{t.notes}</p> : null}
      <footer className="flex items-center gap-3 border-t border-line p-3">
        <p className="shrink-0 ps-1 text-meta text-fg-muted tabular">
          {done}/{t.items.length} ready
        </p>
        <button
          type="button"
          disabled={busy.has(t.orderId)}
          onClick={() => onBump(t)}
          className={cn("ms-auto inline-flex h-14 min-w-28 items-center justify-center gap-2 rounded-full px-5 text-headline font-semibold transition-colors focus-visible:focus-ring disabled:opacity-60", allReady ? "bg-fg text-bg hover:bg-brand-hover" : "border-2 border-fg bg-bg text-fg hover:bg-bg-subtle")}
        >
          <Check aria-hidden className="size-5" strokeWidth={2.5} />
          {tr("kitchen.bump")}
        </button>
      </footer>
    </article>
  );
}

function StatusChip({ status, tr }: { status: Item["status"]; tr: ReturnType<typeof translator> }) {
  const label = tr(status === "queued" ? "kitchen.new" : status === "cooking" ? "kitchen.cooking" : "kitchen.ready");
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-[88px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-meta-strong",
        status === "queued" && "border-2 border-line-strong text-fg",
        status === "cooking" && "bg-fg text-bg",
        status === "ready" && "border border-line bg-bg text-fg",
      )}
    >
      {status === "ready" ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : null}
      {label}
    </span>
  );
}

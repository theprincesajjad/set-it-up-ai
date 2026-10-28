"use client";
import { nowMs } from "@/lib/restaurant/util";
/**
 * Kitchen display (restaurant.kds, frame 03). Neutral tickets: a hairline border, and the accent only for a late timer.
 * A pre-order inside two hours of its fire time is pinned at the top with the FIRE time and a "Start dum" button.
 * Allergies are a red full-width band. Dish names show in the cook's language with English beneath. The "Sold out" button
 * takes a dish off the menu, the counter and WhatsApp until the end of the day (or until it is restored).
 */
import { Check, ChefHat, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCALES, translator, type MessageKey, type restaurantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Tag } from "@/components/dashboard/kit";
import { stationLabel } from "@/components/dashboard/restaurant/menu";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api/errors";
import { localeFont } from "@/lib/i18n/fonts";
import { useApi } from "@/lib/dashboard/useApi";
import { clock12, clockIn, isolate as iso } from "@/lib/restaurant/kitchenText";

export { clock12, clockIn };

type Ticket = restaurantApi.KitchenTicketDto;
type Item = restaurantApi.KitchenItemDto;
type Lang = restaurantApi.MenuLang;
type Tr = ReturnType<typeof translator>;

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
const stationIn = (tr: Tr, s: string) => {
  const key = `station.${s}` as MessageKey;
  const word = tr(key);
  return word === key || word.startsWith("station.") ? stationLabel(s) : word;
};
/** Order kind and channel in the ticket language. */
const tagsIn = (tr: Tr, kind: string | null | undefined, channel: string | null | undefined): string[] =>
  [kind === "preorder" ? tr("kitchen.kind.preorder") : null, channel && ["web", "phone", "counter", "whatsapp"].includes(channel) ? tr(`kitchen.chan.${channel}` as MessageKey) : null].filter((x): x is string => !!x);
const NEXT: Record<Item["status"], "cooking" | "ready" | null> = { queued: "cooking", cooking: "ready", ready: null };

/** A ticket is late only once it was fired and has waited longer than LATE_AFTER_S. */
export const isLate = (t: Pick<Ticket, "firedAt">, ageSeconds: number) => !!t.firedAt && ageSeconds >= LATE_AFTER_S;

export function ageText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The label font for one language: its Noto family first, Inter after, so a cook's script never falls back to a box. */
const scriptStyle = (l: Lang) => localeFont(l).fontFamily;
const scriptClass = (l: Lang) => localeFont(l).className;

export function KitchenBoard() {
  const { api, base, detail } = useMerchant();
  const sp = useSearchParams();
  const initialLang = (MENU_LANGS as readonly string[]).includes(sp.get("lang") ?? "") ? (sp.get("lang") as Lang) : undefined;
  const [station, setStation] = useState<string>(sp.get("station") ?? "all");
  const [lang, setLang] = useState<Lang | undefined>(initialLang);
  // `at` is when the poll landed: ticket ages are counted forward from it so the timers tick without extra requests.
  const state = useApi(async () => ({ res: await api.kitchen.tickets({ station, ...(lang ? { lang } : {}) }), at: nowMs() }), [api, station, lang], { pollMs: POLL_MS });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<{ orderId: string; number: number }[]>([]);
  const [full, setFull] = useState(false);
  const [soldOutOpen, setSoldOutOpen] = useState(false);

  // Age is computed from when each poll landed, so the timers tick every second without extra requests.
  const [tick, setTick] = useState(() => nowMs());
  useEffect(() => {
    const t = setInterval(() => setTick(nowMs()), 1000);
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
  const ageOf = (t: Ticket) => (t.firedAt ? t.ageSeconds + Math.max(0, (tick - fetchedAt) / 1000) : 0);

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
    if (!next || t.pinned) return;
    // Show the change at once; the next poll confirms it.
    state.setData((d) => (d ? { ...d, res: { ...d.res, items: d.res.items.map((x) => (x.orderId === t.orderId ? { ...x, items: x.items.map((y) => (y.id === i.id ? { ...y, status: next } : y)) } : x)) } } : d));
    void withBusy(i.id, () => api.kitchen.setItem(i.id, next));
  };
  const bump = (t: Ticket) => {
    state.setData((d) => (d ? { ...d, res: { ...d.res, items: d.res.items.filter((x) => x.orderId !== t.orderId) } } : d));
    setRecent((r) => [{ orderId: t.orderId, number: t.number }, ...r.filter((x) => x.orderId !== t.orderId)].slice(0, 5));
    void withBusy(t.orderId, () => api.kitchen.bump(t.orderId));
  };
  const startDum = (t: Ticket) => void withBusy(t.orderId, () => api.kitchen.fire(t.orderId));
  const recall = (r: { orderId: string }) => {
    setRecent((x) => x.filter((y) => y.orderId !== r.orderId));
    void withBusy(r.orderId, () => api.kitchen.recall(r.orderId));
  };

  const cols = useMemo(() => COLUMNS.map((c) => ({ ...c, tickets: tickets.filter((t) => columnOf(t) === c.id) })), [tickets]);
  const lateCount = tickets.filter((t) => isLate(t, ageOf(t))).length;
  const stations = data?.stations ?? [];
  const soldOutCount = data?.soldOutCount ?? 0;

  return (
    <div className={cn("fixed inset-0 z-modal flex flex-col bg-bg-subtle text-fg", scriptClass(shownLang))} style={{ fontFamily: scriptStyle(shownLang) }} lang={LOCALES[shownLang].bcp47} dir={dir} role="region" aria-label="Kitchen display">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-3 md:px-6">
        <Link href={base} className="inline-flex h-[38px] items-center gap-2 rounded-full border border-line px-4 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
          <X aria-hidden className="size-4" />
          <span lang={LOCALES[shownLang].bcp47} style={{ fontFamily: scriptStyle(shownLang) }} className={scriptClass(shownLang)}>{tr("kitchen.exit")}</span>
        </Link>
        <div className="min-w-0">
          <h1 className={cn("truncate text-headline leading-tight text-fg", shownLang === "en" && "display")}>{shownLang === "en" ? "kitchen" : tr("kitchen.title")}</h1>
          <p className="truncate text-caption text-fg-muted">
            <bdi>{detail.merchant.name}</bdi> · {tr("kitchen.openN", { n: iso(shownLang, tickets.length) })}
            {lateCount ? ` · ${tr("kitchen.lateN", { n: iso(shownLang, lateCount) })}` : ""}
          </p>
        </div>

        <nav aria-label="Station" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0">
          {["all", ...stations].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={station === s}
              onClick={() => setStation(s)}
              className={cn("inline-flex h-[38px] shrink-0 items-center rounded-full border px-4 text-meta-strong transition-colors focus-visible:focus-ring", station === s ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
            >
              {s === "all" ? tr("kitchen.all") : stationIn(tr, s)}
            </button>
          ))}
          {station !== "all" && !stations.includes(station) ? (
            <span className="inline-flex h-[38px] shrink-0 items-center rounded-full border border-primary bg-primary px-4 text-meta-strong text-primary-foreground">{stationLabel(station)}</span>
          ) : null}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoldOutOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex h-[38px] items-center rounded-full border border-line bg-bg px-4 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring"
          >
            {tr("kitchen.soldOutN", { n: iso(shownLang, soldOutCount) })}
          </button>
          <div role="group" aria-label="Ticket language" className="flex h-[46px] items-center gap-0.5 rounded-full border border-line bg-bg p-1">
            {MENU_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={LOCALES[l].bcp47}
                aria-pressed={shownLang === l}
                aria-label={LOCALES[l].englishName}
                onClick={() => setLang(l)}
                style={{ fontFamily: scriptStyle(l) }}
                className={cn("inline-flex h-[38px] min-w-12 items-center justify-center rounded-full px-3 text-meta-strong leading-none focus-visible:focus-ring", scriptClass(l), shownLang === l ? "bg-primary text-primary-foreground" : "text-fg hover:bg-bg-subtle")}
              >
                {LOCALES[l].short}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={full ? "Leave full screen" : "Full screen"}
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined))}
            className="hidden size-[38px] items-center justify-center rounded-full border border-line bg-bg hover:bg-bg-subtle focus-visible:focus-ring sm:inline-flex"
          >
            {full ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
          </button>
        </div>
      </header>

      {error || (state.error && !state.data) ? (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-line bg-bg px-4 py-2 text-meta md:px-6">
          <span className="text-negative">{error ?? state.error}</span>
          <button type="button" onClick={() => { setError(null); void state.reload(); }} className="h-9 rounded-full px-3 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
            {tr("kitchen.tryAgain")}
          </button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
        {!data ? (
          <p className="p-6 text-body text-fg-muted">{state.error ? "" : tr("kitchen.loading")}</p>
        ) : !tickets.length ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <ChefHat aria-hidden className="size-10 text-fg-subtle" strokeWidth={1.5} />
            <p className="display text-title text-fg">{tr("kitchen.noTickets").replace(/\.$/, "").toLowerCase()}</p>
            <p className="max-w-sm text-body text-fg-muted">{tr("kitchen.emptyBody", { n: iso(shownLang, POLL_MS / 1000) })}</p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:h-full md:grid-cols-3 md:gap-0 md:p-0">
            {cols.map((c) => (
              <section key={c.id} aria-label={`${tr(c.key)} tickets`} className={cn("flex min-h-0 min-w-0 flex-col md:border-s md:border-line md:first:border-s-0", !c.tickets.length && "max-md:hidden")}>
                <h2 className={cn("flex items-baseline justify-between gap-2 px-1 py-0 text-meta-strong text-fg-muted md:px-5 md:pb-2.5 md:pt-4", shownLang === "en" && "uppercase tracking-wide")}>
                  <span>
                    {tr(c.key)} <span className="tabular text-fg">{iso(shownLang, c.tickets.length)}</span>
                  </span>
                </h2>
                <ul className="flex min-h-0 flex-col gap-3 pt-2 md:flex-1 md:overflow-y-auto md:px-4 md:pb-4">
                  {c.tickets.map((t) => (
                    <li key={t.orderId}>
                      <TicketCard ticket={t} age={ageOf(t)} lang={shownLang} dir={dir} tr={tr} busy={busy} onAdvance={advance} onBump={bump} onFire={startDum} />
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
          <p className="me-1 text-meta text-fg-muted">{tr("kitchen.justBumped")}</p>
          {recent.map((r) => (
            <button key={r.orderId} type="button" onClick={() => recall(r)} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-meta-strong hover:bg-bg-subtle focus-visible:focus-ring">
              <RotateCcw aria-hidden className="size-4" />
              {tr("kitchen.recall", { n: iso(shownLang, r.number) })}
            </button>
          ))}
        </footer>
      ) : null}

      {soldOutOpen ? <SoldOutSheet lang={shownLang} tr={tr} onClose={() => setSoldOutOpen(false)} onChanged={() => void state.reload()} /> : null}
    </div>
  );
}

function TicketCard({ ticket: t, age, lang, dir, tr, busy, onAdvance, onBump, onFire }: { ticket: Ticket; age: number; lang: Lang; dir: "ltr" | "rtl"; tr: Tr; busy: Set<string>; onAdvance: (t: Ticket, i: Item) => void; onBump: (t: Ticket) => void; onFire: (t: Ticket) => void }) {
  const late = isLate(t, age);
  const allReady = t.items.every((i) => i.status === "ready");
  const done = t.items.filter((i) => i.status === "ready").length;
  const hm = (v: string) => clockIn(lang, v);
  const fireTime = t.fireAt ? hm(t.fireAt) : null;
  const sub = [t.customerName ? iso(lang, t.customerName) : null, t.pickupAt ? tr("kitchen.pickup", { time: iso(lang, hm(t.pickupAt)) }) : null].filter(Boolean).join(" · ");
  const tags = tagsIn(tr, t.kind, t.channel);
  return (
    <article aria-label={`Ticket ${t.number}`} className={cn("overflow-hidden rounded-card bg-card", t.allergyNote ? "border-2 border-negative" : t.pinned ? "border-2 border-fg" : "border border-line")}>
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="display text-[30px] leading-none text-fg tabular" dir="ltr">#{t.number}</p>
            {tags.length ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {tags.map((x) => (
                  <Tag key={x}>{x}</Tag>
                ))}
              </span>
            ) : null}
          </div>
          {sub ? <p className="mt-1.5 text-meta text-fg-muted tabular">{sub}</p> : null}
        </div>
        {t.pinned && fireTime ? (
          <p className="shrink-0 rounded-full bg-primary px-3 py-1 text-title font-semibold text-primary-foreground tabular">{tr("kitchen.fire", { time: iso(lang, fireTime.replace(/ ?[ap]m$/, "")) })}</p>
        ) : (
          <p
            className={cn("shrink-0 rounded-full px-3 py-1 text-title tabular", late ? "bg-points-soft font-bold text-points-text" : "bg-bg-subtle font-semibold text-fg")}
            aria-label={`${Math.floor(age / 60)} minutes${late ? ", late" : ""}`}
          >
            {ageText(age)}
          </p>
        )}
      </header>
      {t.pinned && fireTime && t.pickupAt ? (
        <p className={cn("bg-primary px-4 py-1.5 text-meta-strong text-primary-foreground tabular", lang === "en" && "uppercase tracking-wide")}>{tr("kitchen.fireBand", { time: iso(lang, fireTime), min: iso(lang, t.cookMinutes), pickup: iso(lang, hm(t.pickupAt)) })}</p>
      ) : null}
      {t.allergyNote ? (
        <p role="alert" lang={LOCALES[lang].bcp47} dir={dir} className={cn("bg-negative px-4 py-1.5 text-meta-strong font-bold text-[#FFFFFF]", lang === "en" && "uppercase tracking-wide", scriptClass(lang))} style={{ fontFamily: scriptStyle(lang) }}>
          {tr("kitchen.allergy", { text: iso(lang, t.allergyNote) })}
        </p>
      ) : null}
      <ul className="border-t border-line">
        {t.items.map((i) => {
          const next = NEXT[i.status];
          return (
            <li key={i.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                disabled={!next || busy.has(i.id) || t.pinned}
                onClick={() => onAdvance(t, i)}
                aria-label={`${i.quantity} ${i.name}, ${i.status === "queued" ? "new" : i.status}${next && !t.pinned ? `. Tap to mark ${next}` : ""}`}
                className={cn(
                  "flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-start transition-colors focus-visible:focus-ring disabled:cursor-default",
                  i.status === "ready" ? "bg-bg-subtle text-fg-muted" : "bg-bg enabled:hover:bg-bg-subtle enabled:active:bg-bg-muted",
                )}
              >
                <span className="w-9 shrink-0 text-center text-[24px] font-bold leading-none tabular" dir="ltr">{i.quantity}×</span>
                <span className={cn("min-w-0 flex-1", scriptClass(lang))} lang={LOCALES[lang].bcp47} dir={dir} style={{ fontFamily: scriptStyle(lang) }}>
                  <span className={cn("block text-[19px] font-semibold leading-snug", lang === "ur" && "leading-[1.9]", i.status === "ready" && "line-through decoration-2")}>{i.name}</span>
                  {i.name !== i.nameEn ? <span lang="en" dir="ltr" className="block text-[12px] leading-4 text-fg-muted" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>{i.nameEn}</span> : null}
                  {i.modifiers.length ? <span className="block text-meta text-fg-muted">{i.modifiers.map((m) => m.option).join(", ")}</span> : null}
                  {i.notes ? <span className="mt-0.5 inline-block rounded-full bg-bg-subtle px-2 py-0.5 text-meta text-fg">{i.notes}</span> : null}
                </span>
                {t.pinned ? <span className="shrink-0 rounded-full border border-line px-3 py-1 text-meta-strong text-fg">{tr("kitchen.new")}</span> : <StatusChip status={i.status} tr={tr} />}
              </button>
            </li>
          );
        })}
      </ul>
      {t.notes ? <p className="border-t border-line bg-bg-subtle px-4 py-2 text-meta font-medium text-fg">{t.notes}</p> : null}
      <footer className="flex items-center gap-3 border-t border-line p-3">
        <p className="shrink-0 ps-1 text-meta text-fg-muted tabular">{tr("kitchen.readyCount", { done, total: t.items.length })}</p>
        {t.pinned ? (
          <button type="button" disabled={busy.has(t.orderId)} onClick={() => onFire(t)} className="ms-auto inline-flex h-12 min-w-28 items-center justify-center rounded-full bg-primary px-5 text-title font-semibold text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:focus-ring disabled:opacity-60">
            {tr("kitchen.startDum")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy.has(t.orderId)}
            onClick={() => onBump(t)}
            className={cn("ms-auto inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-full px-5 text-title font-semibold transition-colors focus-visible:focus-ring disabled:opacity-60", allReady ? "bg-primary text-primary-foreground hover:bg-brand-hover" : "bg-primary text-primary-foreground hover:bg-brand-hover")}
          >
            <Check aria-hidden className="size-5" strokeWidth={2.5} />
            {tr("kitchen.bump")}
          </button>
        )}
      </footer>
    </article>
  );
}

function StatusChip({ status, tr }: { status: Item["status"]; tr: Tr }) {
  const label = tr(status === "queued" ? "kitchen.new" : status === "cooking" ? "kitchen.cooking" : "kitchen.ready");
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-[84px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-meta-strong",
        status === "queued" && "border border-line text-fg",
        status === "cooking" && "bg-primary text-primary-foreground",
        status === "ready" && "border border-line bg-bg text-fg",
      )}
    >
      {status === "ready" ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : null}
      {label}
    </span>
  );
}

/** The "Sold out (n)" sheet: tap a dish to stop selling it today, or until restored; restore it from here. */
function SoldOutSheet({ lang, tr, onClose, onChanged }: { lang: Lang; tr: Tr; onClose: () => void; onChanged: () => void }) {
  const { api } = useMerchant();
  const state = useApi(() => api.kitchen.soldOut(lang), [api, lang]);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const set = async (id: string, until: restaurantApi.SoldOutBody["until"]) => {
    setWorking(id);
    setError(null);
    try {
      await api.kitchen.setSoldOut(id, until);
      await state.reload();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };
  const until = (iso: string) => {
    const d = new Date(iso);
    return d.getTime() - nowMs() > 3 * 86_400_000 ? "until restored" : `until ${d.toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" })}`;
  };
  return (
    <div className="fixed inset-0 z-modal">
      <button type="button" aria-label={tr("kitchen.close")} tabIndex={-1} className="absolute inset-0 cursor-default bg-fg/20" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={tr("kitchen.soldOutTitle")} lang={LOCALES[lang].bcp47} dir={LOCALES[lang].dir} className={cn("absolute inset-y-0 end-0 flex w-full max-w-[460px] flex-col border-s border-line bg-bg shadow-float", scriptClass(lang))} style={{ fontFamily: scriptStyle(lang) }}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-headline text-fg">{tr("kitchen.soldOutTitle")}</h2>
            <p className="mt-0.5 text-meta text-fg-muted">{tr("kitchen.soldOutHint")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("kitchen.close")} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line hover:bg-bg-subtle focus-visible:focus-ring">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        {error ? <p role="alert" className="border-b border-line px-5 py-2 text-meta text-negative">{error}</p> : null}
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {!state.data ? <li className="px-5 py-4 text-meta text-fg-muted">{state.error ?? "Loading..."}</li> : null}
          {(state.data?.items ?? []).map((i) => (
            <li key={i.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-body-strong text-fg">
                  {i.name}
                  {i.name !== i.nameEn ? <span lang="en" dir="ltr" className="block text-[12px] font-normal text-fg-muted">{i.nameEn}</span> : null}
                </p>
                {i.soldOutUntil ? <p className="shrink-0 text-meta text-negative">{until(i.soldOutUntil)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {i.soldOutUntil ? (
                  <button type="button" disabled={working === i.id} onClick={() => void set(i.id, "restore")} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-meta-strong text-primary-foreground hover:bg-brand-hover focus-visible:focus-ring disabled:opacity-60">
                    {tr("kitchen.restore")}
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={working === i.id} onClick={() => void set(i.id, "today")} className="inline-flex h-11 items-center rounded-full border border-line px-5 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-60">
                      {tr("kitchen.soldOutToday")}
                    </button>
                    <button type="button" disabled={working === i.id} onClick={() => void set(i.id, new Date(nowMs() + 365 * 86_400_000).toISOString())} className="inline-flex h-11 items-center rounded-full border border-line px-5 text-meta text-fg-muted hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-60">
                      {tr("kitchen.soldOutUntilRestored")}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

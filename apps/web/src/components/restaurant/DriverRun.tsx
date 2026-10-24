"use client";
/**
 * The driver's page (design M1): progress, the next stop with Navigate, Call and a big Delivered button, the stops after it,
 * and a sticky "running late" button. No login. Taps that can't reach the server (no signal in a lobby) are queued in
 * localStorage and retried, so the driver never loses a delivery. The list refreshes every 30 seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { tiffinApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { Heading, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);
type Run = tiffinApi.DriverRunResponse;
type Stop = tiffinApi.DriverStop;
type Tap = { deliveryId: string; status: "delivered" | "missed"; note?: string };
const FINAL = ["delivered", "picked_up", "missed", "skipped"];

const qKey = (token: string) => `ll_driver_queue_${token}`;
function readQueue(token: string): Tap[] {
  try {
    return JSON.parse(localStorage.getItem(qKey(token)) ?? "[]") as Tap[];
  } catch {
    return [];
  }
}
function writeQueue(token: string, q: Tap[]) {
  try {
    localStorage.setItem(qKey(token), JSON.stringify(q));
  } catch {
    /* private mode: taps are still sent now, just not remembered across a reload */
  }
}

export function DriverRun({ token }: { token: string }) {
  const { t, date, number } = useFmt();
  const [run, setRun] = useState<Run | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Stop | null>(null);
  const [late, setLate] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      setRun(await api.driver.run(token));
      setFailed(false);
    } catch (e) {
      if (isApiError(e) && (e.status === 410 || e.status === 404)) setGone(true);
      else setFailed(true);
    }
  }, [token]);

  /** Send queued taps in order; keep the ones the network refused. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q = readQueue(token);
      while (q.length) {
        const tap = q[0]!;
        try {
          setRun(await api.driver.stop(token, tap.deliveryId, { status: tap.status, ...(tap.note ? { note: tap.note } : {}) }));
        } catch (e) {
          // A 4xx means the server will never accept it (already done, wrong run): drop it. Network errors stay queued.
          if (!(isApiError(e) && e.status >= 400 && e.status < 500)) break;
        }
        q = q.slice(1);
        writeQueue(token, q);
      }
      setQueued(readQueue(token).length);
    } finally {
      flushing.current = false;
    }
  }, [token]);

  useEffect(() => {
    // Initial fetch and queue replay; both only set state after their awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().then(flush);
    const poll = setInterval(() => void flush().then(load), 30_000);
    const online = () => void flush().then(load);
    window.addEventListener("online", online);
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", online);
    };
  }, [load, flush]);

  async function mark(stop: Stop, status: "delivered" | "missed", why?: string) {
    setBusy(true);
    setNote(null);
    // Show it done at once; the server's answer replaces this list.
    setRun((r) => (r ? { ...r, stops: r.stops.map((s) => (s.deliveryId === stop.deliveryId ? { ...s, status } : s)), progress: { ...r.progress, done: r.progress.done + 1 } } : r));
    writeQueue(token, [...readQueue(token), { deliveryId: stop.deliveryId, status, ...(why ? { note: why } : {}) }]);
    setQueued(readQueue(token).length);
    await flush();
    setBusy(false);
  }

  async function sendLate(minutes: number) {
    setLate(false);
    try {
      const r = await api.driver.late(token, minutes);
      setNote({ tone: "success", text: t("tcb.dr.lateSent", { n: r.notified }) });
      await load();
    } catch (e) {
      setNote({ tone: isApiError(e) && e.status === 429 ? "info" : "danger", text: isApiError(e) && e.status === 429 ? t("tcb.dr.lateWait") : errorMessage(e) });
    }
  }

  if (gone)
    return (
      <div className="flex flex-col gap-2 pt-6">
        <Heading level={2}>{t("tcb.dr.expired")}</Heading>
        <p className="text-body text-fg-muted">{t("tcb.dr.expiredBody")}</p>
      </div>
    );
  if (!run)
    return failed ? (
      <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void load()}>{t("rc.tryAgain")}</Button>}>{t("tcb.dr.offline")}</Banner>
    ) : (
      <div className="flex flex-col gap-3" aria-label={t("rc.loading")}>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );

  const open = run.stops.filter((s) => !FINAL.includes(s.status));
  const next = open[0] ?? null;
  const then = open.slice(1);
  const pct = run.progress.total ? Math.round((run.progress.done / run.progress.total) * 100) : 100;
  const where = (s: Stop) => [s.address, s.postalCode].filter(Boolean).join(", ");
  const nav = (s: Stop) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where(s))}`;
  const label = (s: Stop) => s.order ?? run.stops.findIndex((x) => x.deliveryId === s.deliveryId) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading level={3} plain className="truncate"><bdi>{run.route.name.split(":")[0]}</bdi>{run.route.driverName ? <> · <bdi>{run.route.driverName}</bdi></> : null}</Heading>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-meta text-fg">
          <span aria-live="polite">{t("tcb.dr.progress", { done: number(run.progress.done), total: number(run.progress.total) })}</span>
          <span className="text-fg-muted">{date(new Date(`${run.date}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" }, "UTC")}</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={run.progress.total} aria-valuenow={run.progress.done} className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bg-muted">
          <div className="h-full rounded-full bg-fg" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {queued ? <Banner tone="info">{t("tcb.dr.offline")}</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}

      {run.stops.length === 0 ? <p className="text-body text-fg-muted">{t("tcb.dr.noStops")}</p> : null}
      {run.stops.length > 0 && !next ? <p className="rounded-card bg-bg-subtle p-5 text-body-strong text-fg">{t("tcb.dr.allDone")}</p> : null}

      {next ? (
        <section aria-label={t("tcb.dr.next", { n: label(next) })} className="flex flex-col gap-3 rounded-card border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">{t("tcb.dr.next", { n: label(next) })}</p>
            <span className="rounded-full bg-bg-muted px-2.5 py-1 text-caption text-fg">{t("tcb.dr.tiffins", { n: next.servings })}</span>
          </div>
          <Heading level={1} plain className="break-words !text-[28px] !leading-8">{next.customerName ?? "—"}</Heading>
          <p className="text-body text-fg">{where(next) || "—"}</p>
          {next.addressNotes ? <p className="rounded-card bg-bg-subtle px-3 py-2.5 text-body text-fg">{t("tcb.dr.door", { notes: next.addressNotes })}</p> : null}
          {next.dietaryNotes ? (
            <p className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-caption font-medium text-accent-text">{t("tcb.dr.diet")}</span>
              {next.dietaryNotes}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth href={nav(next)} formTarget="_blank" disabled={!where(next)}>
              {t("tcb.dr.navigate")}
            </Button>
            <Button variant="secondary" fullWidth href={next.phone ? `tel:${next.phone}` : undefined} disabled={!next.phone}>
              {t("tcb.dr.call")}
            </Button>
          </div>
          <Button size="lg" fullWidth loading={busy} onClick={() => void mark(next, "delivered")}>
            {t("tcb.dr.delivered")}
          </Button>
          <button type="button" onClick={() => setReasons(next)} className="mx-auto min-h-10 rounded-full px-4 text-body text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:focus-ring">
            {t("tcb.dr.couldNot")}
          </button>
        </section>
      ) : null}

      {then.length ? (
        <section aria-label={t("tcb.dr.then")}>
          <h2 className="pb-1 text-meta-strong text-fg-muted">{t("tcb.dr.then")}</h2>
          <ol>
            {then.map((s) => (
              <li key={s.deliveryId} className="flex items-start gap-4 border-t border-line py-3">
                <span className="w-6 shrink-0 text-body tabular-nums text-fg-muted">{label(s)}</span>
                <div className="min-w-0">
                  <p className="text-body text-fg">{s.customerName ?? "—"}</p>
                  <p className="text-meta text-fg-muted">{where(s)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-bg px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[480px]">
          <Button variant="secondary" fullWidth onClick={() => setLate(true)} disabled={!open.length}>
            {t("tcb.dr.late")}
          </Button>
        </div>
      </div>

      <Modal open={!!reasons} onClose={() => setReasons(null)} title={t("tcb.dr.reasonTitle")} variant="sheet" actions={<Button variant="secondary" onClick={() => setReasons(null)}>{t("tcb.dr.cancel")}</Button>}>
        <div className="flex flex-col gap-2">
          {([["tcb.dr.reasonNoAnswer"], ["tcb.dr.reasonAddress"], ["tcb.dr.reasonOther"]] as const).map(([k]) => (
            <Button key={k} variant="secondary" fullWidth onClick={() => { const s = reasons; setReasons(null); if (s) void mark(s, "missed", t(k)); }}>
              {t(k)}
            </Button>
          ))}
        </div>
      </Modal>
      <Modal open={late} onClose={() => setLate(false)} title={t("tcb.dr.lateAsk")} variant="sheet" actions={<Button variant="secondary" onClick={() => setLate(false)}>{t("tcb.dr.cancel")}</Button>}>
        <div className="flex flex-col gap-2">
          {[10, 20, 30].map((m) => (
            <Button key={m} variant="secondary" fullWidth onClick={() => void sendLate(m)}>
              {t("tcb.dr.minutes", { n: m })} · {t("tcb.dr.lateSend")}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

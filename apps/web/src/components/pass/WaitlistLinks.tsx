"use client";
/**
 * "Waiting for a spot" on the card (phase-pro P2): each shop the client asked for a spot at, what and when, with Remove; an open offer
 * shows the slot, how long it is held and "Take it". Nothing renders when they are not waiting anywhere.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { waitlistApi } from "@ll/shared";
import { useFmt } from "@/components/restaurant/ui";
import { browserClient } from "@/lib/api/browser";
import { myWaitlistEndpoints } from "@/lib/api/waitlist";
import { dayDate } from "@/lib/restaurant/util";

const api = myWaitlistEndpoints(browserClient);

export function WaitlistLinks() {
  const { t, date, time } = useFmt();
  const [items, setItems] = useState<waitlistApi.MyWaitlistEntryDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.list().then((r) => live && setItems(r.items)).catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);

  if (!items?.length) return null;
  const day = (d: string) => date(dayDate(d), { weekday: "short", month: "short", day: "numeric" }, "UTC");
  const span = (e: waitlistApi.MyWaitlistEntryDto) => (e.windowStart === e.windowEnd ? day(e.windowStart) : t("wl.mine.window", { from: day(e.windowStart), to: day(e.windowEnd) }));

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.remove(id);
      setItems((cur) => (cur ?? []).filter((x) => x.id !== id));
    } catch {
      // stays on the list; they can try again
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={t("wl.mine.title")} data-testid="wl-mine" className="flex flex-col rounded-card border border-border bg-card px-4">
      <h2 className="pt-3.5 text-meta-strong text-fg-muted">{t("wl.mine.title")}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-strong text-fg"><bdi>{e.merchant.name}</bdi></p>
              <p className="text-meta text-fg-muted">
                {e.serviceName}
                {e.staffName ? ` · ${e.staffName}` : ""} · {span(e)} · {t(`wl.pref.${e.timePref}`)}
              </p>
              {e.offer ? (
                <p className="text-meta text-fg">{t("wl.mine.offer", { when: `${date(e.offer.startsAt, { weekday: "short", month: "short", day: "numeric" })}, ${time(e.offer.startsAt)}`, time: time(e.offer.expiresAt) })}</p>
              ) : null}
            </div>
            {e.offer ? (
              <Link href={`/w/${encodeURIComponent(e.offer.token)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-pill bg-primary px-4 text-meta-strong text-primary-foreground focus-visible:focus-ring">{t("wl.take.cta")}</Link>
            ) : (
              <button type="button" disabled={busy === e.id} onClick={() => void remove(e.id)} className="min-h-11 shrink-0 px-2 text-meta-strong text-fg underline underline-offset-2 focus-visible:focus-ring disabled:text-fg-subtle">{t("wl.mine.remove")}</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

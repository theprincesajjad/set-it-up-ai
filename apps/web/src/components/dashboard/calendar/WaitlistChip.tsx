"use client";
/**
 * The waitlist on the calendar (phase-pro P2, docs/business/pro-value.md §3.2 P2 and §5.1).
 *
 *  - `date`: the day view's strip of slots that opened that day: "2:00 pm · Offered to Ayesha · 1 h 40 left", "Filled from the
 *    waitlist", or on Free "4 waiting · On Pro they'd be offered this slot. See Pro" (one quiet plan line per screen).
 *  - `appt`: inside the cancel confirm, the switch "Offer this slot to the waitlist (3 waiting)", on by default on Pro, Studio and the
 *    trial; on Free the same switch, off and locked, with the plan line.
 */
import { CalendarClock, CircleCheck, Clock, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { appointmentsApi, waitlistApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { seeProHref, timeLeft, useWaitlistApi } from "@/lib/dashboard/waitlist";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

type Props = { appt: appointmentsApi.AppointmentDto; date?: never } | { date: string; appt?: never };

export function WaitlistChip(props: Props) {
  return props.appt ? <CancelSwitch appt={props.appt} /> : <DayStrip date={props.date!} />;
}

function SeePro() {
  const { base } = useMerchant();
  const { t } = useLocaleOrEnglish();
  return (
    <a href={seeProHref(base)} className="relative whitespace-nowrap font-[550] text-link hover:underline focus-visible:focus-ring after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
      {t("wl.seePro")}
    </a>
  );
}

function CancelSwitch({ appt }: { appt: appointmentsApi.AppointmentDto }) {
  const { t } = useLocaleOrEnglish();
  const api = useWaitlistApi();
  // A waitlist offer being cancelled goes to the next match by itself; nothing to choose.
  const skip = appt.source === ("waitlist" as appointmentsApi.AppointmentSource);
  const state = useApi(skip ? null : () => api.slot(appt.id), [api, appt.id, skip]);
  const [on, setOn] = useState<boolean | null>(null);
  const d = state.data;
  if (skip || !d) return null;
  if (!d.autoOffer) {
    if (!d.waiting) return null;
    return (
      <div className="mt-3" data-testid="wl-cancel-switch">
        <Switch checked={false} disabled onChange={() => undefined} label={t("wl.cancel.switch", { n: d.waiting })} description={<><Lock aria-hidden className="me-1 inline size-3 align-[-1px]" />{t("wl.cancel.free")} <SeePro /></>} />
      </div>
    );
  }
  const checked = on ?? d.offer;
  return (
    <div className="mt-3" data-testid="wl-cancel-switch">
      <Switch
        checked={checked}
        onChange={async (v) => {
          setOn(v);
          try {
            await api.setSlot(appt.id, v);
          } catch {
            setOn(!v);
          }
        }}
        label={t("wl.cancel.switch", { n: d.waiting })}
        description={d.waiting ? (d.matching ? t("wl.cancel.matching", { n: d.matching }) : t("wl.cancel.noMatch")) : t("wl.cancel.empty")}
      />
    </div>
  );
}

const ONCE_A_WEEK = "ll-wl-nudge";

function DayStrip({ date }: { date: string }) {
  const { detail } = useMerchant();
  const { t, time } = useLocaleOrEnglish();
  const api = useWaitlistApi();
  const now = useNow();
  const tz = detail.merchant.timezone;
  const state = useApi(() => api.list({ status: "open", day: date }), [api, date], { pollMs: 60_000 });
  const [nudge, setNudge] = useState(false);
  const d = state.data;
  const slots = d?.slots.filter((s) => s.status !== "skipped") ?? [];
  const lockedNoMatch = !!d && !d.autoOffer && slots.length > 0 && slots.every((s) => s.matching === 0);

  // The "no one waiting" line on Free shows at most once a week (pro-value.md §5.1).
  useEffect(() => {
    if (!lockedNoMatch) return;
    try {
      const last = Number(window.localStorage.getItem(ONCE_A_WEEK) ?? 0);
      if (Date.now() - last > 7 * 24 * 3600_000) {
        window.localStorage.setItem(ONCE_A_WEEK, String(Date.now()));
        // Reading browser storage after mount is the point.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNudge(true);
      }
    } catch {
      // storage blocked: say nothing
    }
  }, [lockedNoMatch]);

  if (!d || !slots.length) return null;
  const freeLine = !d.autoOffer ? slots.find((s) => s.matching > 0) : undefined;
  const chip = (s: waitlistApi.FreedSlotDto) => {
    const at = time(s.startsAt, tz);
    if (s.status === "offered" && s.offer) return { icon: Clock, tone: "info", text: t("wl.chip.offered", { time: at, name: s.offer.name, left: timeLeft(t, s.offer.expiresAt, now) }) };
    if (s.status === "filled") return { icon: CircleCheck, tone: "positive", text: t("wl.chip.filled", { time: at, name: s.filledBy ?? "" }) };
    if (s.status === "locked") return { icon: Lock, tone: "muted", text: s.matching ? t("wl.chip.waiting", { time: at, n: s.matching }) : t("wl.chip.cancelled", { time: at }) };
    return { icon: CalendarClock, tone: "muted", text: t("wl.chip.unfilled", { time: at }) };
  };
  return (
    <section aria-label={t("wl.chip.label")} className="flex flex-col gap-2" data-testid="wl-day-strip">
      <ul className="flex flex-wrap gap-2">
        {slots.map((s) => {
          const c = chip(s);
          const Icon = c.icon;
          return (
            <li key={s.id} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-meta", c.tone === "info" ? "bg-info-soft text-info-text" : c.tone === "positive" ? "bg-success-soft text-success-text" : "bg-bg-subtle text-fg-muted")}>
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span>{c.text}</span>
              {s.staffName ? <bdi className="sr-only"> · {s.staffName}</bdi> : null}
            </li>
          );
        })}
      </ul>
      {freeLine ? (
        <p className="text-body text-muted-foreground">
          {t("wl.chip.free", { n: freeLine.matching })} <SeePro />
        </p>
      ) : nudge ? (
        <p className="text-body text-muted-foreground">
          {t("wl.chip.freeNone")} <SeePro />
        </p>
      ) : null}
    </section>
  );
}

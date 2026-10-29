"use client";
/**
 * Home, solo pro, first 30 days (docs/design/onboarding-v1.md §4): "Your first 10 bookings". The online bookings by clients (not the
 * owner), whether that is on pace (3 by day 7), four milestones, one next move, and where bookings came from. Replaces the setup rail
 * on Home once the link is shared; the rail's remaining cards stay on the setup page.
 */
import type { merchantApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Icon3d } from "@/components/ui/Icon3d";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";
import { useMerchant } from "../MerchantContext";

const MOVE_PATH: Record<merchantApi.SoloBookingsDto["nextMove"], string> = {
  share: "/setup?step=share",
  invite: "/setup?step=invite",
  deposit: "/setup?step=services",
  story: "/setup?step=share",
};

export function BookingsActivationCard({ solo, base }: { solo: merchantApi.SoloSetupDto; base: string }) {
  const { t } = useLocale();
  const { detail } = useMerchant();
  const b = solo.bookings;
  const pct = Math.min(100, (b.count / b.target) * 100);
  const mark = Math.min(100, (b.paceBookings / b.target) * 100);
  const move = b.nextMove;
  return (
    <section aria-labelledby="bookings-card-title" className="flex flex-col gap-5 rounded-r4 border border-border bg-card p-4 shadow-card md:p-5" data-testid="bookings-activation">
      <div className="flex items-start gap-4">
        <Icon3d name={b.count ? "check_done" : "first_booking"} size={b.count ? 64 : 96} trade={detail.merchant.vertical} />
        <div className="min-w-0 flex-1">
          <h2 id="bookings-card-title" className="text-headline text-foreground">{t("ob.solo.activation.title")}</h2>
          <p className="mt-1 text-[26px] font-[700] leading-8 tabular-nums text-foreground">{t("ob.solo.activation.count", { n: b.count })}</p>
          <p className={cn("mt-1 text-meta", b.onTrack ? "text-success-text" : "text-warning-text")}>
            {b.onTrack ? t("ob.solo.activation.onTrack") : t("ob.solo.activation.behind")} · {t("ob.solo.activation.pace", { n: b.paceBookings, day: b.paceByDay })}
          </p>
        </div>
      </div>
      <div role="progressbar" aria-label={t("ob.solo.activation.title")} aria-valuemin={0} aria-valuemax={b.target} aria-valuenow={b.count} className="relative h-1.5 w-full rounded-full bg-lg-seg-track">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-foreground" style={{ insetInlineStart: `${mark}%` }} />
      </div>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4" aria-label={t("ob.card.milestones")}>
        {b.milestones.map((m) => (
          <li key={m.key} className="flex min-w-0 items-center gap-2 text-body text-foreground">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full border-[1.5px]", m.at ? "border-primary bg-primary" : "border-border-strong")} />
            {t(`ob.solo.activation.ms.${m.key}`)}
            <span className="sr-only"> {m.at ? t("ob.solo.activation.reached") : t("ob.solo.activation.notYet")}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 rounded-r4 bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-body font-[650] text-foreground">{t(`ob.solo.move.${move}.title`)}</p>
          <p className="mt-0.5 text-body text-muted-foreground">{t(`ob.solo.move.${move}.body`)}</p>
        </div>
        <Button size="quick" href={`${base}${MOVE_PATH[move]}`} className="shrink-0 self-start sm:self-center max-md:h-11">
          {t(`ob.solo.move.${move}.cta`)}
        </Button>
      </div>
      <div>
        <h3 className="text-body font-[650] text-foreground">{t("ob.solo.activation.sources")}</h3>
        {b.sources.length ? (
          <ul className="mt-2 divide-y divide-border">
            {b.sources.map((s) => (
              <li key={s.source} className="flex min-h-9 items-center justify-between text-body text-foreground">
                {t(`ob.solo.activation.src.${s.source}`)}
                <span className="tabular-nums text-muted-foreground">{s.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-meta text-muted-foreground">{t("ob.solo.activation.noneYet")}</p>
        )}
      </div>
    </section>
  );
}

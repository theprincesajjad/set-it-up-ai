"use client";
import type { MessageKey } from "@ll/shared";
import { cn } from "@/lib/cn";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatMoney, formatTime } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { StatusDot } from "./Badge";

const STEPS = [
  { id: "pending", label: "ui.order.stepSent" },
  { id: "preparing", label: "ui.order.stepPreparing" },
  { id: "ready", label: "ui.order.stepReady" },
  { id: "picked_up", label: "ui.order.stepPickedUp" },
] as const satisfies readonly { id: string; label: MessageKey }[];

function stepIndex(status: string) {
  if (status === "accepted" || status === "preparing") return 1;
  if (status === "ready") return 2;
  if (status === "picked_up") return 3;
  return 0;
}

export interface OrderTrackerProps {
  status: string;
  statusLabel: string;
  number: number;
  pickupAt?: string | null;
  shopName: string;
  cancelReason?: string | null;
  refundCents?: number | null;
}

/** 4-step order tracker (system.md §6 OrderTracker). v2: large title + big order number, thin black progress. */
export function OrderTracker({ status, statusLabel, number, pickupAt, shopName, cancelReason, refundCents }: OrderTrackerProps) {
  const { t, locale, money, time } = useLocaleOrEnglish();
  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="display text-large-title text-fg">{statusLabel}</h2>
        {cancelReason ? <p className="text-body text-fg">{cancelReason}</p> : null}
        {refundCents ? <p className="text-meta text-fg-muted">{t("wp.os.refund", { amount: locale === "en" ? formatMoney(refundCents) : money(refundCents) })}</p> : null}
      </div>
    );
  }
  const idx = stepIndex(status);
  const ready = status === "ready";
  return (
    <div className="flex flex-col gap-5">
      <div role={ready ? "status" : undefined} className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">
          {ready ? <StatusDot tone="positive">{t("ui.order.showAtCounter")}</StatusDot> : <>{shopName}{pickupAt ? ` · ${t("wp.os.pickupShort", { time: locale === "en" ? formatTime(pickupAt) : time(pickupAt) })}` : ""}</>}
        </p>
        <h2 className="display text-large-title text-fg">{ready ? t("ui.order.ready") : statusLabel}</h2>
        <p className="display mt-2 text-[56px] leading-none tabular-nums text-fg">#{number}</p>
      </div>
      <ol aria-label={t("wp.os.progress")} className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-col gap-2">
            <span aria-hidden className={cn("h-1 rounded-full", i <= idx ? "bg-fg" : "bg-bg-muted")} />
            <span className={cn("text-meta", i === idx ? "font-semibold text-fg" : "text-fg-muted")}>
              <span className="sr-only">{`${t(i < idx ? "wp.step.done" : i === idx ? "wp.step.current" : "wp.step.next")} `}</span>
              {t(s.label)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

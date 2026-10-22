import { PackageCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMoney, formatTime } from "@/lib/format";

const STEPS = [
  { id: "pending", label: "Sent" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "picked_up", label: "Picked up" },
] as const;

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

/** 4-step order tracker (system.md §6 OrderTracker). */
export function OrderTracker({ status, statusLabel, number, pickupAt, shopName, cancelReason, refundCents }: OrderTrackerProps) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="rounded-lg bg-neutral-subtle p-5 text-on-neutral-subtle">
        <h2 className="text-h2">{statusLabel}</h2>
        {cancelReason ? <p className="mt-1 text-body">{cancelReason}</p> : null}
        {refundCents ? <p className="mt-1 text-body-sm">Refund: {formatMoney(refundCents)} back to your card.</p> : null}
      </div>
    );
  }
  const idx = stepIndex(status);
  return (
    <div className="flex flex-col gap-4">
      {status === "ready" ? (
        <div role="status" className="flex flex-col items-center gap-2 rounded-lg bg-success p-6 text-center text-on-success">
          <PackageCheck aria-hidden className="size-10" />
          <h2 className="text-h2">Ready for pickup</h2>
          <p className="text-body">Show this at the counter</p>
          <p className="text-code tabular-nums">#{number}</p>
        </div>
      ) : (
        <div>
          <h2 className="text-h2 text-fg">{statusLabel}</h2>
          <p className="text-body text-fg-muted">
            {shopName}
            {pickupAt ? ` · pickup ${formatTime(pickupAt)}` : ""}
          </p>
          <p className="mt-2 text-[32px] font-bold leading-9 tracking-[0.12em] tabular-nums text-fg">#{number}</p>
        </div>
      )}
      <ol aria-label="Order progress" className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-col gap-1.5">
            <span aria-hidden className={cn("h-2 rounded-full", i <= idx ? "bg-brand" : "bg-ring-track")} />
            <span className={cn("text-caption", i === idx ? "font-semibold text-fg" : "text-fg-muted")}>
              <span className="sr-only">{i < idx ? "Done: " : i === idx ? "Current: " : "Next: "}</span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

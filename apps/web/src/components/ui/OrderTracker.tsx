import { cn } from "@/lib/cn";
import { formatMoney, formatTime } from "@/lib/format";
import { StatusDot } from "./Badge";

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

/** 4-step order tracker (system.md §6 OrderTracker). v2: large title + big order number, thin black progress. */
export function OrderTracker({ status, statusLabel, number, pickupAt, shopName, cancelReason, refundCents }: OrderTrackerProps) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="display text-large-title text-fg">{statusLabel}</h2>
        {cancelReason ? <p className="text-body text-fg">{cancelReason}</p> : null}
        {refundCents ? <p className="text-meta text-fg-muted">Refund: {formatMoney(refundCents)} back to your card.</p> : null}
      </div>
    );
  }
  const idx = stepIndex(status);
  const ready = status === "ready";
  return (
    <div className="flex flex-col gap-5">
      <div role={ready ? "status" : undefined} className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted">
          {ready ? <StatusDot tone="positive">Show this at the counter</StatusDot> : <>{shopName}{pickupAt ? ` · pickup ${formatTime(pickupAt)}` : ""}</>}
        </p>
        <h2 className="display text-large-title text-fg">{ready ? "Ready for pickup" : statusLabel}</h2>
        <p className="display mt-2 text-[56px] leading-none tabular-nums text-fg">#{number}</p>
      </div>
      <ol aria-label="Order progress" className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex flex-col gap-2">
            <span aria-hidden className={cn("h-1 rounded-full", i <= idx ? "bg-fg" : "bg-bg-muted")} />
            <span className={cn("text-meta", i === idx ? "font-semibold text-fg" : "text-fg-muted")}>
              <span className="sr-only">{i < idx ? "Done: " : i === idx ? "Current: " : "Next: "}</span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { Check, Hourglass, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

export interface TimelineStep {
  id: string;
  label: string;
  state: "done" | "current" | "upcoming" | "stopped" | "waiting";
  at?: string | null;
  note?: ReactNode;
  photos?: string[];
  /** Expanded content (e.g. QuoteApproval on the quote_sent step). */
  children?: ReactNode;
}

/** Vertical service-ticket timeline (system.md §6 Timeline). */
export function Timeline({ steps, label = "Progress" }: { steps: TimelineStep[]; label?: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
            {!last ? <span aria-hidden className={cn("absolute start-[9px] top-5 bottom-0 w-px", s.state === "done" ? "bg-fg" : "bg-line")} /> : null}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] mt-px flex size-[19px] shrink-0 items-center justify-center rounded-full",
                s.state === "done" && "bg-fg text-bg",
                s.state === "current" && "border-[1.5px] border-fg bg-bg",
                s.state === "upcoming" && "border border-line bg-bg",
                s.state === "stopped" && "bg-negative text-[#FFFFFF]",
                s.state === "waiting" && "border-[1.5px] border-fg bg-bg text-fg",
              )}
            >
              {s.state === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
              {s.state === "current" ? <span className="size-[7px] rounded-full bg-fg" /> : null}
              {s.state === "stopped" ? <X className="size-3" strokeWidth={3} /> : null}
              {s.state === "waiting" ? <Hourglass className="size-2.5" strokeWidth={2.5} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-body", s.state === "upcoming" ? "text-fg-muted" : "text-fg", (s.state === "current" || s.state === "waiting") && "font-semibold")}>
                <span className="sr-only">{s.state === "done" ? "Done: " : s.state === "current" ? "Current: " : s.state === "stopped" ? "Stopped: " : s.state === "waiting" ? "Waiting: " : "Next: "}</span>
                {s.label}
              </p>
              {s.at ? <p className="text-meta text-fg-muted">{formatDateTime(s.at)}</p> : null}
              {s.note ? <div className="mt-1 text-meta text-fg">{s.note}</div> : null}
              {s.photos?.length ? (
                <div className="mt-2 flex gap-2">
                  {s.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p} src={p} alt="" className="size-16 rounded-input object-cover" loading="lazy" />
                  ))}
                </div>
              ) : null}
              {s.children ? <div className="mt-3">{s.children}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TICKET_FLOW = ["intake", "diagnosing", "quote_sent", "approved", "in_progress", "ready", "picked_up"] as const;

/** Build Timeline steps from a ticket status + events (customer-visible). */
export function ticketSteps(status: string, labels: Record<string, string>, events: { status: string | null; createdAt: string; note: string | null }[] = []): TimelineStep[] {
  const at = (s: string) => events.filter((e) => e.status === s).at(-1)?.createdAt ?? null;
  if (status === "declined" || status === "cancelled") {
    const reached = TICKET_FLOW.filter((s) => at(s));
    return [
      ...reached.map((s) => ({ id: s, label: labels[s] ?? s, state: "done" as const, at: at(s) })),
      { id: status, label: labels[status] ?? status, state: "stopped" as const, at: at(status) },
    ];
  }
  const flow: string[] = [...TICKET_FLOW];
  if (status === "waiting_parts") flow.splice(flow.indexOf("ready"), 0, "waiting_parts");
  const idx = flow.indexOf(status);
  return flow.map((s, i) => ({
    id: s,
    label: labels[s] ?? s,
    state: i < idx ? "done" : i === idx ? (s === "waiting_parts" ? "waiting" : s === "picked_up" ? "done" : "current") : "upcoming",
    at: at(s),
  }));
}

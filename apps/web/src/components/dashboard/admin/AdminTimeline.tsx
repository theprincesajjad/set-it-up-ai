"use client";
/**
 * History as a timeline (wave Q, team admin), on the ReUI Timeline (components/primitives/timeline): the audit log and a business's
 * history. Entries are grouped under a day heading ("Today", "Yesterday", "Mon, Oct 26"); each has an icon chip on the rail, a title, a
 * muted meta line, the time on the end, and optional details that open in place. A list (role=list / listitem) so it reads as one.
 */
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/primitives/timeline";
import { cn } from "@/lib/utils";

export interface HistoryEntry {
  id: string;
  /** ISO time. Entries without a time (a step not reached yet) go last under "Not yet". */
  at: string | null;
  icon: LucideIcon;
  /** done = filled chip; pending = dashed (not reached yet); alert = destructive chip. */
  state?: "done" | "pending" | "alert";
  title: ReactNode;
  meta?: ReactNode;
  /** Shown under a "Details" toggle. */
  details?: ReactNode;
  /** Shown on the end instead of the time ("Not yet"). */
  trailing?: ReactNode;
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((t - x) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

function Entry({ e, step, open, onToggle }: { e: HistoryEntry; step: number; open: boolean; onToggle: () => void }) {
  const Icon = e.icon;
  const state = e.state ?? "done";
  return (
    <TimelineItem step={step} role="listitem" className="group-data-[orientation=vertical]/timeline:ms-12 group-data-[orientation=vertical]/timeline:not-last:pb-2">
      <TimelineHeader>
        <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-start-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-2rem)] group-data-[orientation=vertical]/timeline:translate-y-8 bg-line" />
        <TimelineIndicator
          className={cn(
            "flex size-8 items-center justify-center border-0 group-data-[orientation=vertical]/timeline:-start-7",
            state === "alert" ? "bg-destructive-soft text-destructive-text" : state === "pending" ? "border border-dashed border-line-strong bg-card text-fg-subtle" : "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" strokeWidth={2} />
        </TimelineIndicator>
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <TimelineTitle render={<p />} className={cn("min-w-0 text-body font-[550] leading-6", state === "pending" ? "text-fg-muted" : "text-fg")}>
            {e.title}
          </TimelineTitle>
          <span className="shrink-0 text-meta tabular-nums text-fg-muted">{e.trailing ?? (e.at ? <time dateTime={e.at}>{timeOf(e.at)}</time> : null)}</span>
        </div>
      </TimelineHeader>
      {e.meta || e.details ? (
        <TimelineContent className="text-meta text-fg-muted">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            {e.meta ? <div className="min-w-0 flex-1 break-words">{e.meta}</div> : null}
            {e.details ? (
              <button type="button" aria-expanded={open} onClick={onToggle} className="-me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm px-2 text-meta font-medium text-fg hover:bg-accent focus-visible:focus-ring">
                {open ? "Hide" : "Details"}
                <ChevronDown aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
              </button>
            ) : null}
          </div>
          {e.details && open ? <div className="mt-1 rounded-r4 bg-bg-subtle p-3">{e.details}</div> : null}
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

/**
 * Entries newest first (or in the order given with `grouped={false}`), grouped by day. `label` names the list for screen readers and tests.
 */
export function HistoryTimeline({ entries, label, grouped = true, className }: { entries: HistoryEntry[]; label: string; grouped?: boolean; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups: { key: string; label: string | null; items: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const k = grouped ? (e.at ? dayKey(e.at) : "none") : "all";
    let g = groups.find((x) => x.key === k);
    if (!g) {
      g = { key: k, label: grouped ? (e.at ? dayLabel(e.at) : "Not yet") : null, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  let step = 0;
  // One list per day (a heading cannot sit inside a list); a single ungrouped list carries `label` itself.
  return (
    <div data-history={label} className={cn("flex flex-col gap-5", className)}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label ? `${label}: ${g.label}` : undefined} className="flex flex-col gap-3">
          {g.label ? <h3 className="text-caption font-semibold uppercase tracking-[0.04em] text-fg-muted">{g.label}</h3> : null}
          <Timeline value={entries.length} role="list" aria-label={g.label ? `${label}, ${g.label}` : label} className="ps-1">
            {g.items.map((e) => (
              <Entry key={e.id} e={e} step={++step} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </Timeline>
        </section>
      ))}
    </div>
  );
}

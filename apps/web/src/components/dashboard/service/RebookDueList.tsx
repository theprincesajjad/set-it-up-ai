"use client";
import type { serviceApi } from "@ll/shared";
import { Capsules, Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { channelLabel, dueLabel, initials, weeksAgo } from "@/lib/dashboard/rebooking";
import { cn } from "@/lib/cn";

export type RebookTab = "due" | "late" | "snoozed";

/** Who is due to come back, with Send and Skip for each. Snooze hides a row for two weeks. */
export function RebookDueList({ data, tab, onTab, now, busyKey, onSend, onSkip, onSnooze }: { data: serviceApi.RebookingResponse; tab: RebookTab; onTab: (t: RebookTab) => void; now: Date; busyKey: string | null; onSend: (r: serviceApi.RebookingRowDto) => void; onSkip: (r: serviceApi.RebookingRowDto) => void; onSnooze: (r: serviceApi.RebookingRowDto) => void }) {
  return (
    <Panel
      title="Due to rebook"
      action={
        <Capsules
          label="Show"
          value={tab}
          onChange={onTab}
          options={[
            { value: "due", label: "This week", count: data.counts.due },
            { value: "late", label: "Late", count: data.counts.late, tone: "negative" },
            { value: "snoozed", label: "Snoozed", count: data.counts.snoozed },
          ]}
        />
      }
    >
      {data.items.length ? (
        <ul className="divide-y divide-line">
          {data.items.map((r) => {
            const due = dueLabel(r);
            const key = `${r.userId}:${r.serviceId}`;
            return (
              <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-muted text-caption font-semibold text-fg-muted">{initials(r.customerName)}</span>
                <span className="min-w-[160px] flex-1">
                  <span className="block truncate text-body-strong text-fg">{r.customerName ?? "Customer"}</span>
                  <span className="block truncate text-meta text-fg-muted">{r.serviceName} · {weeksAgo(r.lastVisitAt, now)}</span>
                </span>
                <span className={cn("w-44 text-meta", due.late ? "text-negative" : "text-fg-muted")}>{r.state === "snoozed" ? "Snoozed" : due.text}</span>
                <span className={cn("rounded-full border px-2.5 py-1 text-caption", r.canSend ? "border-line text-fg-muted" : "border-line text-negative")}>{channelLabel(r)}</span>
                <span className="flex gap-2">
                  <Button size="sm" loading={busyKey === `send:${key}`} disabled={!r.canSend || r.state === "snoozed"} onClick={() => onSend(r)}>Send</Button>
                  <Button size="sm" variant="secondary" disabled={busyKey?.endsWith(key) ?? false} onClick={() => onSkip(r)}>Skip</Button>
                  {r.state !== "snoozed" ? <Button size="sm" variant="ghost" onClick={() => onSnooze(r)}>Snooze</Button> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-meta text-fg-muted">{tab === "snoozed" ? "Nobody is snoozed." : tab === "late" ? "Nobody is late." : "Nobody is due this week. Set how often each service comes back on the right."}</p>
      )}
    </Panel>
  );
}

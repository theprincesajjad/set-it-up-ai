"use client";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";

const STEPS: { day: number; title: string; body: string }[] = [
  { day: 3, title: "Day 3", body: "Text: your item is ready" },
  { day: 7, title: "Day 7", body: "Text with the pay link" },
  { day: 30, title: "Day 30", body: "A call task on the ticket for staff" },
  { day: 60, title: "Day 60", body: "Flag the ticket. You decide about the notice before sale (Repair and Storage Liens Act). We never sell or notify for you." },
];

/** The reminder ladder for finished work, and the tickets sitting on the shelf. Day 60 only flags; recording a notice is the shop's own record. */
export function PickupLadder({ data, onRecord, ticketHref }: { data: serviceApi.UncollectedResponse; onRecord: (ticketId: string) => Promise<unknown>; ticketHref: (id: string) => string }) {
  const [confirm, setConfirm] = useState<serviceApi.PickupReminderRow | null>(null);
  return (
    <Panel title="Pickup reminders" action={<span className="text-meta text-fg-muted">{data.items.length} {data.items.length === 1 ? "item" : "items"} waiting</span>}>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Reminder ladder">
        {STEPS.map((s) => (
          <li key={s.day} className="rounded-card bg-bg-subtle p-3">
            <p className="text-meta-strong text-fg">{s.title}</p>
            <p className="mt-0.5 text-meta text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      {data.items.length ? (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {data.items.map((r) => (
            <li key={r.ticketId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-meta">
              <a href={ticketHref(r.ticketId)} className="w-14 shrink-0 text-meta-strong tabular text-fg hover:underline">#{r.number}</a>
              <span className="min-w-0 flex-1 truncate text-fg">{r.itemLabel} · {r.customerName ?? "Customer"}</span>
              <span className={r.lienEligible ? "text-negative" : "text-fg-muted"}>Ready {r.readyDays} {r.readyDays === 1 ? "day" : "days"}</span>
              {r.lienEligible ? (
                r.lienNoticeSentAt ? <span className="text-fg-muted">Notice recorded</span> : <Button size="sm" variant="secondary" onClick={() => setConfirm(r)}>Record notice sent</Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Record a notice before sale for #${confirm?.number ?? ""}?`}
        body="Only record this after you have sent the notice yourself. We keep the date and who recorded it. Nothing is sent to the customer and nothing is sold."
        confirmLabel="Yes, I sent it"
        onConfirm={async () => {
          if (confirm) await onRecord(confirm.ticketId);
        }}
      />
    </Panel>
  );
}

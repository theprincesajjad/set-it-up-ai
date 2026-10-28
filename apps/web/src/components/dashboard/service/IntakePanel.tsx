"use client";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";

/** Item and intake: photos, serial, the passcode note, the condition chips ticked at drop-off, and whether terms were signed. */
export function IntakePanel({ ticket, checkedInAt }: { ticket: serviceApi.TicketDto; checkedInAt: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const d = ticket.itemDetails;
  const serial = d.imei || d.serial || d.vin || d.plate || null;
  const rows: [string, string][] = [
    ...(serial ? ([[d.imei ? "IMEI" : d.vin ? "VIN" : d.plate ? "Plate" : "Serial", serial]] as [string, string][]) : []),
    ...(ticket.itemKind === "device" ? ([["Passcode", "Not stored. Customer unlocks at pickup"]] as [string, string][]) : []),
    ...(ticket.shelfLocation ? ([["Shelf", ticket.shelfLocation]] as [string, string][]) : []),
    ["Issue", ticket.issue],
  ];
  const items = parseItems(d.items);
  return (
    <Panel title="Item and intake" action={checkedInAt ? <span className="text-meta text-fg-muted">Checked in {formatDateTime(checkedInAt)}</span> : undefined}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {ticket.photos.length ? (
            <ul className="flex gap-2" aria-label="Intake photos">
              {ticket.photos.map((p, i) => (
                <li key={p}>
                  <button type="button" onClick={() => setOpen(p)} aria-label={`Open photo ${i + 1} of ${ticket.photos.length}`} className="size-[88px] overflow-hidden rounded-card bg-bg-subtle focus-visible:focus-ring">
                    {broken.has(p) ? (
                      <span className="flex size-full items-center justify-center text-fg-subtle"><ImageOff aria-hidden className="size-5" strokeWidth={1.5} /></span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p} alt={`Intake photo ${i + 1}`} className="size-full object-cover" loading="lazy" onError={() => setBroken((b) => new Set(b).add(p))} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-1.5 text-meta">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-muted">{k}</dt>
                <dd className="text-end text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {items.length ? (
          <ul aria-label="Items" className="divide-y divide-line rounded-card bg-card shadow-card px-3 text-meta">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 py-2"><span className="text-fg">{it.description}</span>{it.tag ? <span className="text-fg-muted">{it.tag}</span> : null}</li>
            ))}
          </ul>
        ) : null}
        {ticket.intakeChecklist.length || ticket.termsAcceptedAt ? (
          <ul aria-label="Condition at drop-off" className="flex flex-wrap gap-2">
            {ticket.intakeChecklist.map((c) => (
              <li key={c} className="rounded-full border border-line px-3 py-1 text-meta text-fg">{c}</li>
            ))}
            {ticket.termsAcceptedAt ? <li className="rounded-full border border-line px-3 py-1 text-meta text-fg">Terms signed {formatDateTime(ticket.termsAcceptedAt)}</li> : null}
          </ul>
        ) : null}
        {ticket.intakeNotes ? <p className="border-s-[3px] border-line ps-3 text-meta text-fg-muted">{ticket.intakeNotes}</p> : null}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Intake photo" size="md">
        {open ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={open} alt="Intake photo, full size" className="max-h-[70vh] w-full rounded-card object-contain" />
        ) : null}
      </Modal>
    </Panel>
  );
}

function parseItems(raw: string | undefined): { description: string; tag?: string }[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as { description: string; tag?: string }[]) : [];
  } catch {
    return [];
  }
}

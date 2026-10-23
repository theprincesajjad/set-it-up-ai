"use client";
import { useState } from "react";
import type { commerceApi, merchantApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { DAY_LABEL, DAY_ORDER } from "@/lib/dashboard/hours";
import { dayHours } from "@/lib/dashboard/dropoff";

/** Hours come from Locations. Slot length, drop-offs per slot and how many days stay open are the only settings here. */
export function DropoffHours({ hours, settings, locationsHref, busy, error, onSave, onUnblock }: { hours: merchantApi.Hours | null; settings: commerceApi.DropoffSettingsDto; locationsHref: string; busy: boolean; error: string | null; onSave: (v: { slotMinutes: number; capacity: number; daysAhead: number }) => void; onUnblock: (date: string) => void }) {
  const [mins, setMins] = useState(String(settings.slotMinutes));
  const [cap, setCap] = useState(String(settings.capacity));
  const [ahead, setAhead] = useState(String(settings.daysAhead));
  const bad = (v: string, lo: number, hi: number) => !v || Number(v) < lo || Number(v) > hi;
  const invalid = bad(mins, 10, 120) || bad(cap, 1, 20) || bad(ahead, 1, 30);
  const dirty = Number(mins) !== settings.slotMinutes || Number(cap) !== settings.capacity || Number(ahead) !== settings.daysAhead;
  return (
    <Panel title="Drop-off hours" action={<a href={locationsHref} className="text-meta-strong text-fg underline-offset-2 hover:underline focus-visible:focus-ring">Edit</a>}>
      <dl className="divide-y divide-line">
        {DAY_ORDER.map((d) => (
          <div key={d} className="flex justify-between gap-4 py-2 text-meta">
            <dt className="text-fg">{DAY_LABEL[d].slice(0, 3)}</dt>
            <dd className={dayHours(hours, d) === "Closed" ? "text-fg-muted" : "tabular text-fg-muted"}>{dayHours(hours, d)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <TextField label="Slot length" suffix="min" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} error={bad(mins, 10, 120) ? "10 to 120" : null} />
        <TextField label="Per slot" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} error={bad(cap, 1, 20) ? "1 to 20" : null} />
        <TextField label="Days ahead" inputMode="numeric" value={ahead} onChange={(e) => setAhead(e.target.value.replace(/\D/g, ""))} error={bad(ahead, 1, 30) ? "1 to 30" : null} />
      </div>
      <p className="mt-3 text-meta text-fg-muted">Hours come from Locations. Change them there and new days follow. A new slot length or per-slot number applies to days with no bookings yet. Booked slots are never removed.</p>
      {settings.blockedDates.length ? (
        <div className="mt-3">
          <p className="text-meta-strong text-fg">Closed days</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {settings.blockedDates.map((d) => (
              <li key={d} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-meta text-fg">
                {d}
                <button type="button" className="text-fg-muted underline focus-visible:focus-ring" onClick={() => onUnblock(d)} aria-label={`Reopen ${d}`}>Reopen</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <div className="mt-3"><Banner tone="danger">{error}</Banner></div> : null}
      {dirty ? (
        <Button className="mt-4" size="sm" loading={busy} disabled={invalid} onClick={() => onSave({ slotMinutes: Number(mins), capacity: Number(cap), daysAhead: Number(ahead) })}>
          Save
        </Button>
      ) : null}
    </Panel>
  );
}

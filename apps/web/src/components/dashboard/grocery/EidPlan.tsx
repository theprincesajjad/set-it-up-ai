"use client";
/**
 * Eid al-Adha plan (docs/research/grocers.md, frame D5): animals per pick-up day, how much notice, and when bookings should open.
 * Built on the pre-order caps the restaurant pack already has: one date rule per day, a wait list when a day is full, the deposit
 * and the free-cancel window on each item. The date follows moon sighting: move it a day or two and the pick-up days follow.
 */
import { useEffect, useState } from "react";
import { DefList, Dot, ErrorLine, Panel, SkeletonRows, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NumberField, dayLabel, dayShort } from "@/components/dashboard/restaurant/common";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export function EidPlan({ canEdit }: { canEdit: boolean }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.grocery.eid(), [api]);
  const p = state.data;
  const [caps, setCaps] = useState<string[]>([]);
  const [lead, setLead] = useState("14");
  const [moved, setMoved] = useState("");
  useEffect(() => {
    if (!p) return;
    // Seed the form from the saved plan when it first loads or after a save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaps(p.days.map((d) => (d.cap == null ? "" : String(d.cap))));
    setMoved(p.start);
    setLead(String(p.leadHours != null ? Math.round(p.leadHours / 24) : 14));
  }, [p]);

  if (state.error && !p) return <ErrorLine message={state.error} onRetry={() => void state.reload()} />;
  if (!p) return <SkeletonRows rows={5} />;

  async function save() {
    if (!p) return;
    const r = await act.run(() => api.grocery.saveEid({ year: p.year, days: caps.map((c) => ({ cap: Number.parseInt(c || "0", 10) })), leadHours: Math.round(Number.parseFloat(lead || "0") * 24) }));
    if (r) {
      state.setData(r);
      toast({ message: "Eid plan saved", tone: "success" });
    }
  }
  async function move(to: string | null) {
    if (!p) return;
    const r = await act.run(() => api.grocery.moveEid(p.year, to));
    if (r) {
      state.setData(r);
      toast({ message: to ? `Eid moved to ${dayLabel(r.start)}. Pick-up days followed.` : "Back on the calendar date", tone: "success" });
    }
  }
  const noCaps = p.days.every((d) => d.cap == null);

  return (
    <div className="flex flex-col gap-6">
      <StatBlock
        label="Eid al-Adha"
        cols={3}
        items={[
          { label: "Bookings should open", value: dayShort(p.bookingsOpen), caption: "Eight weeks before" },
          { label: `Eid al-Adha ${p.year}`, value: dayShort(p.start), caption: p.moved ? `Moved from ${dayShort(p.calendarStart)}` : "Confirm after moon sighting" },
          { label: "Pick-up days", value: String(p.days.length), caption: `${dayShort(p.days[0]?.date ?? p.start)} to ${dayShort(p.days.at(-1)?.date ?? p.start)}` },
        ]}
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {noCaps ? <Banner tone="info">Set how many animals you take each day. Until you do, bookings are not limited.</Banner> : null}

      <Panel title="Animals per pick-up day" description="Whole animals and shares count against these. A full day gets a wait list.">
        <div className="flex flex-col gap-3">
          {p.days.map((d, i) => (
            <div key={d.date} className="grid grid-cols-[1fr_120px] items-end gap-3 border-b border-line pb-3 last:border-b-0 sm:grid-cols-[1fr_140px_120px_120px]">
              <div>
                <p className="text-body-strong text-fg">{dayLabel(d.date)}</p>
                <p className="text-meta text-fg-muted">{d.label}</p>
              </div>
              <NumberField label="Animals" disabled={!canEdit} value={caps[i] ?? ""} onChange={(v) => setCaps((c) => c.map((x, k) => (k === i ? v : x)))} />
              <div className="hidden sm:block">
                <p className="text-meta text-fg-muted">Booked</p>
                <p className="text-body-strong tabular text-fg">{d.booked}{d.cap != null ? ` of ${d.cap}` : ""}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-meta text-fg-muted">Wait list</p>
                <p className="text-body-strong tabular text-fg">{d.waiting ? <Dot tone="accent">{d.waiting} waiting</Dot> : "0"}</p>
              </div>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Book at least" suffix="days ahead" disabled={!canEdit} value={lead} onChange={setLead} hint="Qurbani needs time to source and prepare." />
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button loading={act.busy} onClick={() => void save()}>Save plan</Button>
              {p.days.length < 5 ? <Button variant="secondary" onClick={() => setCaps((c) => [...c, ""])} disabled={caps.length >= 5}>Add a day</Button> : null}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Moon sighting" description="Eid can land a day later than the calendar. Move it and the pick-up days follow.">
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Eid al-Adha starts" type="date" disabled={!canEdit} value={moved} onChange={(e) => setMoved(e.target.value)} />
          <Button variant="secondary" disabled={!canEdit || moved === p.start} loading={act.busy} onClick={() => void move(moved)}>Move date</Button>
          {p.moved ? <Button variant="ghost" onClick={() => void move(null)}>Back to {dayShort(p.calendarStart)}</Button> : null}
        </div>
      </Panel>

      <Panel title="What customers can book" description="Whole animals and shares on your price list. Deposits are paid by card when they book.">
        {p.items.length ? (
          <DefList items={p.items.map((i) => ({ label: i.name, value: <span className="tabular">about {formatMoney(i.priceCents)}{i.depositBps ? `, ${i.depositBps / 100}% deposit` : ", no deposit"}</span> }))} />
        ) : (
          <p className="text-meta text-fg-muted">Nothing is set to pre-order only yet. Add a whole goat or a cow share under Price list and switch on Pre-order only.</p>
        )}
      </Panel>
    </div>
  );
}

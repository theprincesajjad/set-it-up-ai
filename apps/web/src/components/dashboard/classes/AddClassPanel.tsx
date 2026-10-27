"use client";
import { useEffect, useState } from "react";
import type { classesApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { startsAtFrom, todayOf } from "@/lib/dashboard/classes";
import { useAction } from "@/lib/dashboard/useApi";

const NEW = "__new";

/** Add a class: pick a class type (or make one), a day and a time, and repeat it weekly. Women-only is a property of the class. */
export function AddClassPanel({ open, onClose, types, onSaved, defaultDate }: { open: boolean; onClose: () => void; types: classesApi.ClassTypeDto[]; onSaved: () => void | Promise<void>; defaultDate?: string }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [typeId, setTypeId] = useState("");
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("16");
  const [women, setWomen] = useState(false);
  const [date, setDate] = useState(defaultDate ?? todayOf());
  const [time, setTime] = useState("18:30");
  const [instructor, setInstructor] = useState("");
  const [weeks, setWeeks] = useState("1");
  useEffect(() => {
    // Reset the form each time the panel opens.
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(defaultDate ?? todayOf());
      setTypeId((cur) => cur || types[0]?.id || NEW);
    }
  }, [open, defaultDate, types]);
  const chosen = types.find((t) => t.id === typeId);
  const making = typeId === NEW || !types.length;
  const valid = (making ? name.trim().length > 0 : !!chosen) && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Add a class"
      subtitle="Repeat it weekly and it keeps the same clock time through the clock change."
      label="Add a class"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!valid}
            onClick={async () => {
              const r = await act.run(async () => {
                let id = typeId;
                if (making) {
                  const t = await api.classes.createType({ name: name.trim(), durationMin: Number(duration) || 60, capacity: Number(capacity) || 16, womenOnly: women });
                  id = t.id;
                }
                return api.classes.createSessions({ classTypeId: id, startsAt: startsAtFrom(date, time), instructorName: instructor.trim() || null, repeatWeeks: Number(weeks) || 1 });
              });
              if (r) {
                toast({ message: r.items.length > 1 ? `${r.items.length} classes added` : "Class added", tone: "success" });
                await onSaved();
                onClose();
              }
            }}
          >
            Add class
          </Button>
        </div>
      }
    >
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="flex flex-col gap-4">
        <Select label="Class" value={making ? NEW : typeId} onChange={(e) => setTypeId(e.target.value)} options={[...types.filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.name}${t.womenOnly ? " (women only)" : ""}` })), { value: NEW, label: "A new class type" }]} />
        {making ? (
          <div className="flex flex-col gap-4 rounded-card border border-line p-4">
            <TextField label="Class name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bhangra Cardio" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Minutes" type="number" min={10} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} />
              <TextField label="Spots" type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-body text-fg">Women only</p>
                <p className="text-meta text-fg-muted">Shown on the class so members know the room is women-only with no photos.</p>
              </div>
              <SwitchControl checked={women} onChange={setWomen} ariaLabel="Women only" />
            </div>
          </div>
        ) : chosen ? (
          <p className="text-meta text-fg-muted">{chosen.durationMin} minutes, {chosen.capacity} spots{chosen.womenOnly ? ", women only" : ""}.</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <TextField label="Instructor" optionalLabel value={instructor} onChange={(e) => setInstructor(e.target.value)} />
        <TextField label="Repeat for this many weeks" type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(e.target.value)} hint="1 adds just this class." />
      </div>
    </SidePanel>
  );
}

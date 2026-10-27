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
import { addDays, startsAtFrom, todayOf } from "@/lib/dashboard/classes";
import { useApi } from "@/lib/dashboard/useApi";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/dashboard/useApi";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** First date on or after `date` that falls on weekday `dow`. */
const onOrAfter = (date: string, dow: number) => addDays(date, (dow - dowOf(date) + 7) % 7);

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
  const [instructorId, setInstructorId] = useState("");
  const [spots, setSpots] = useState("");
  const [dows, setDows] = useState<number[]>([]);
  const team = useApi(() => api.team(), [api]);
  const teachers = (team.data?.items ?? []).filter((s) => s.role === "instructor");
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
                // Several weekdays at one time ("Mon Wed Fri 6:30"): one entry per day, each repeated weekly.
                const days = dows.length ? [...dows].sort().map((d) => onOrAfter(date, d)) : [date];
                const items: classesApi.ClassSessionDto[] = [];
                for (const day of days) {
                  const res = await api.classes.createSessions({
                    classTypeId: id,
                    startsAt: startsAtFrom(day, time),
                    instructorName: instructor.trim() || null,
                    ...(instructorId ? { instructorUserId: instructorId } : {}),
                    ...(Number(spots) > 0 ? { capacity: Number(spots) } : {}),
                    repeatWeeks: Number(weeks) || 1,
                  });
                  items.push(...res.items);
                }
                return { items };
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
        <div className="flex flex-col gap-2">
          <p className="text-meta-strong text-fg">Also on these days <span className="font-normal text-fg-muted">(optional)</span></p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Also on these days">
            {WEEKDAYS.map((w, i) => (
              <button key={w} type="button" aria-pressed={dows.includes(i)} onClick={() => setDows((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))} className={cn("min-h-10 min-w-12 rounded-input border px-3 text-meta-strong focus-visible:focus-ring", dows.includes(i) ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>{w}</button>
            ))}
          </div>
          <p className="text-meta text-fg-muted">{dows.length ? "Each chosen day is added at this time and repeats weekly." : "Leave empty to add only the day above."}</p>
        </div>
        {teachers.length ? (
          <Select label="Instructor login" value={instructorId} onChange={(e) => { setInstructorId(e.target.value); const t = teachers.find((x) => x.userId === e.target.value); if (t) setInstructor(t.name ?? ""); }} options={[{ value: "", label: "No login (just a name)" }, ...teachers.map((t) => ({ value: t.userId, label: t.name ?? t.email ?? "Instructor" }))]} />
        ) : null}
        <TextField label="Instructor" optionalLabel value={instructor} onChange={(e) => setInstructor(e.target.value)} />
        {!making ? <TextField label="Spots for this class" optionalLabel type="number" min={1} max={200} value={spots} onChange={(e) => setSpots(e.target.value)} hint={chosen ? `Leave empty for ${chosen.capacity}.` : undefined} /> : null}
        <TextField label="Repeat for this many weeks" type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(e.target.value)} hint="1 adds just this class." />
      </div>
    </SidePanel>
  );
}

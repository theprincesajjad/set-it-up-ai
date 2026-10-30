"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { PLANS, type appointmentsApi, type merchantApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField, inputBase } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { isApiError } from "@/lib/api/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fromLocalInput } from "@/lib/dashboard/time";
import { duration, money } from "@/lib/dashboard/calendar";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];
type Shift = { start: string; end: string };
type Week = Record<number, { on: boolean; shifts: Shift[] }>;
const DEFAULT: Shift = { start: "09:00", end: "17:00" };

function fromHours(hours: appointmentsApi.StaffHoursDto[]): Week {
  const w: Week = {};
  for (const d of DAYS) {
    const rows = hours.filter((h) => h.weekday === d.weekday).map((h): Shift => ({ start: h.startsLocal, end: h.endsLocal }));
    w[d.weekday] = rows.length ? { on: true, shifts: rows } : { on: false, shifts: [{ ...DEFAULT }] };
  }
  return w;
}

/**
 * Hours and services for one person (staff page, "Hours and services"): weekly shifts (a day can have two), which
 * services they do with their own length and price, and time off. The calendar and online booking read these.
 */
export function StaffScheduleSheet({ open, onClose, member }: { open: boolean; onClose: () => void; member: merchantApi.StaffMember | null }) {
  const { api, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  // phase-pro P1: a calendar past the plan's cap (402 plan_limit) shows the plan line with the plan that allows it (pro-value.md §5.1, §5.6).
  const [limitPlan, setLimitPlan] = useState<"plus" | "studio" | null>(null);
  const cal = useApi(open ? () => api.appointments.staff() : null, [api, open]);
  const services = useApi(open ? () => api.appointments.services("appointment") : null, [api, open]);
  const me = cal.data?.items.find((s) => s.userId === member?.userId);
  const [week, setWeek] = useState<Week>(() => fromHours([]));
  const [does, setDoes] = useState<Record<string, { on: boolean; min: string; price: string }>>({});
  const [offFrom, setOffFrom] = useState("");
  const [offTo, setOffTo] = useState("");
  const [offWhy, setOffWhy] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cal.data || !services.data || !member) return;
    const key = `${member.userId}`;
    if (loadedFor === key) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setWeek(me?.hours.length ? fromHours(me.hours) : Object.fromEntries(DAYS.map((d) => [d.weekday, { on: d.weekday >= 1 && d.weekday <= 6, shifts: [{ ...DEFAULT }] }])) as Week);
    setDoes(
      Object.fromEntries(
        services.data.items.map((s) => {
          const row = me?.services.find((x) => x.serviceId === s.id);
          return [s.id, { on: !!row, min: row?.durationMin ? String(row.durationMin) : "", price: row?.priceCents != null ? String(row.priceCents / 100) : "" }];
        }),
      ),
    );
    setLoadedFor(key);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, cal.data, services.data, member, me, loadedFor]);
  useEffect(() => {
    // Forget the form when the panel closes so the next person starts fresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setLoadedFor(null);
  }, [open]);

  if (!member) return null;
  const setShift = (weekday: number, i: number, patch: Partial<Shift>) => setWeek((w) => ({ ...w, [weekday]: { ...w[weekday]!, shifts: w[weekday]!.shifts.map((s, k) => (k === i ? { ...s, ...patch } : s)) } }));

  async function save() {
    const days = DAYS.flatMap((d) => (week[d.weekday]?.on ? week[d.weekday]!.shifts.map((s) => ({ weekday: d.weekday, startsLocal: s.start, endsLocal: s.end })) : []));
    const picked = Object.entries(does).filter(([, v]) => v.on).map(([serviceId, v]) => ({ serviceId, durationMin: v.min ? Number(v.min) : null, priceCents: v.price !== "" ? Math.round(Number(v.price) * 100) : null }));
    setLimitPlan(null);
    const r = await act.run(async () => {
      try {
        await api.appointments.putHours(member!.userId, { days });
      } catch (e) {
        const plan = isApiError(e) && e.code === "plan_limit" ? (e.details as { offer?: { plan?: string } } | undefined)?.offer?.plan : undefined;
        if (plan === "plus" || plan === "studio") setLimitPlan(plan);
        throw e;
      }
      await api.appointments.putStaffServices(member!.userId, { services: picked });
      return true;
    });
    if (r) {
      toast({ message: `${member!.name ?? "Staff"}'s hours saved`, tone: "success" });
      await cal.reload();
      onClose();
    }
  }
  async function addOff() {
    const from = fromLocalInput(offFrom);
    const to = fromLocalInput(offTo);
    if (!from || !to) return act.setError("Pick when the time off starts and ends.");
    const r = await act.run(() => api.appointments.addTimeOff(member!.userId, { startsAt: from, endsAt: to, reason: offWhy.trim() || null }));
    if (r) {
      setOffFrom("");
      setOffTo("");
      setOffWhy("");
      await cal.reload();
    }
  }

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={`Hours and services for ${member.name ?? "staff"}`}
      title={member.name ?? "Staff"}
      subtitle="Hours and services"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-label="Weekly hours" className="flex flex-col gap-2">
          <h3 className="text-meta-strong text-fg">Weekly hours</h3>
          {DAYS.map((d) => {
            const day = week[d.weekday]!;
            return (
              <div key={d.weekday} className="flex flex-col gap-1.5 border-b border-line pb-2 last:border-b-0">
                <div className="grid grid-cols-[96px_1fr] items-center gap-2">
                  <span className="text-body text-fg">{d.label}</span>
                  <Switch label={day.on ? "Working" : "Off"} checked={day.on} onChange={(on) => setWeek((w) => ({ ...w, [d.weekday]: { ...w[d.weekday]!, on } }))} />
                </div>
                {day.on
                  ? day.shifts.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 ps-[104px]">
                        <input aria-label={`${d.label} starts`} type="time" value={s.start} onChange={(e) => setShift(d.weekday, i, { start: e.target.value })} className={inputBase} />
                        <span aria-hidden>–</span>
                        <input aria-label={`${d.label} ends`} type="time" value={s.end} onChange={(e) => setShift(d.weekday, i, { end: e.target.value })} className={inputBase} />
                        {i > 0 ? (
                          <button type="button" aria-label="Remove shift" onClick={() => setWeek((w) => ({ ...w, [d.weekday]: { ...w[d.weekday]!, shifts: w[d.weekday]!.shifts.filter((_, k) => k !== i) } }))} className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle">
                            <X aria-hidden className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
                {day.on && day.shifts.length < 2 ? (
                  <button type="button" onClick={() => setWeek((w) => ({ ...w, [d.weekday]: { ...w[d.weekday]!, shifts: [...w[d.weekday]!.shifts, { start: "17:30", end: "20:00" }] } }))} className="ms-[104px] w-fit text-meta text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                    Add a second shift
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>

        <section aria-label="Services" className="flex flex-col gap-2">
          <h3 className="text-meta-strong text-fg">Services they do</h3>
          <p className="text-caption text-fg-muted">Their own length or price is optional. Leave blank to use the price list.</p>
          {services.data?.items.length ? (
            <ul className="divide-y divide-line rounded-input border border-line">
              {services.data.items.map((s) => {
                const v = does[s.id] ?? { on: false, min: "", price: "" };
                return (
                  <li key={s.id} className="flex flex-col gap-2 px-3 py-2">
                    <label className="flex items-center gap-2 text-body text-fg">
                      <input type="checkbox" className="size-4" checked={v.on} onChange={(e) => setDoes((cur) => ({ ...cur, [s.id]: { ...v, on: e.target.checked } }))} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="text-meta text-fg-muted tabular">{duration(s.durationMin)} · {money(s.priceCents)}</span>
                    </label>
                    {v.on ? (
                      <div className="grid grid-cols-2 gap-2 ps-6">
                        <TextField label={`${s.name} length`} hideLabel placeholder={`${s.durationMin} min`} suffix="min" inputMode="numeric" value={v.min} onChange={(e) => setDoes((cur) => ({ ...cur, [s.id]: { ...v, min: e.target.value.replace(/\D/g, "") } }))} />
                        <TextField label={`${s.name} price`} hideLabel placeholder={String(s.priceCents / 100)} prefix="$" inputMode="decimal" value={v.price} onChange={(e) => setDoes((cur) => ({ ...cur, [s.id]: { ...v, price: e.target.value.replace(/[^\d.]/g, "") } }))} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-meta text-fg-muted">Add services first.</p>
          )}
        </section>

        <section aria-label="Time off" className="flex flex-col gap-2">
          <h3 className="text-meta-strong text-fg">Time off</h3>
          {me?.timeOff.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {me.timeOff.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-meta">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{t.reason || "Time off"}</span>
                    <span className="block truncate text-fg-muted tabular">{formatDateTime(t.startsAt)} to {formatDateTime(t.endsAt)}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={async () => { await api.appointments.deleteTimeOff(t.id); await cal.reload(); }}>Remove</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta text-fg-muted">No time off booked.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <TextField label="From" type="datetime-local" value={offFrom} onChange={(e) => setOffFrom(e.target.value)} />
            <TextField label="To" type="datetime-local" value={offTo} onChange={(e) => setOffTo(e.target.value)} />
          </div>
          <TextField label="Reason" optionalLabel value={offWhy} onChange={(e) => setOffWhy(e.target.value)} />
          <Button variant="secondary" size="sm" className="w-fit" onClick={addOff}>Add time off</Button>
        </section>
        {act.error && limitPlan ? (
          <PlanLine href={`${base}/billing?plan=${limitPlan}`} linkLabel={`See ${PLANS[limitPlan].name}`}>
            {limitPlan === "studio"
              ? `Three or more calendars are on ${PLANS.studio.name}, ${formatMoney(PLANS.studio.priceCents).replace(/\.00$/, "")} a month for the whole shop. No per-chair charge.`
              : `A second calendar is on ${PLANS.plus.name}; a third and more on ${PLANS.studio.name}, with no per-chair charge.`}
          </PlanLine>
        ) : act.error ? (
          <Banner tone="danger">{act.error}</Banner>
        ) : null}
      </div>
    </SidePanel>
  );
}

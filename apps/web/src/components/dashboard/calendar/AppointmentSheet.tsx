"use client";
import { useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { Dot, type DotTone } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { clock, dateLabel, duePreview, duration, instantAt, money, parts } from "@/lib/dashboard/calendar";
import { maskPhone } from "@/lib/dashboard/customers";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { formatDate } from "@/lib/format";


type Appt = appointmentsApi.AppointmentDto;

const LANG = { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" } as const;
const STATUS: Record<string, { label: string; tone: DotTone }> = {
  booked: { label: "Booked", tone: "info" },
  arrived: { label: "Arrived", tone: "info" },
  in_service: { label: "In the chair", tone: "neutral" },
  completed: { label: "Done", tone: "positive" },
  no_show: { label: "No-show", tone: "negative" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * The right-hand sheet (Figma frame 3): client, services with duration and price, deposit credit, what is due,
 * the client's note, last visits, and the actions that finish a visit: check in, start, check out, reschedule,
 * no-show (with the fee when a card is on file) and cancel.
 */
export function AppointmentSheet({ appt, staff, onChanged, onCheckout, taxStatus }: { appt: Appt; staff: appointmentsApi.BookableStaffDto[]; onChanged: () => void | Promise<void>; onCheckout: () => void; taxStatus?: appointmentsApi.AppointmentSettingsDto["taxStatus"] }) {
  const { api, role, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const detail = useApi(() => api.appointments.detail(appt.id), [api, appt.id, appt.status]);
  const [noShow, setNoShow] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [moving, setMoving] = useState(false);
  const s = STATUS[appt.status] ?? STATUS.booked!;
  const due = duePreview(appt.items, appt.depositPaidAt ? appt.depositCents : 0);
  const start = parts(appt.startsAt);
  const live = appt.status === "booked" || appt.status === "arrived" || appt.status === "in_service";
  // A visit marked Done on the walk-in line has no invoice yet: it still needs its payment, tip and stamp.
  const unpaidDone = appt.status === "completed" && !appt.invoiceId;
  const fee = appt.noShowFeeCents ? Math.max(0, appt.noShowFeeCents - (appt.depositPaidAt ? appt.depositCents : 0)) : 0;
  const minutes = appt.items.reduce((n, i) => n + i.durationMin, 0);

  async function run(fn: () => Promise<unknown>, done?: string) {
    const r = await act.run(fn);
    if (r !== undefined) {
      if (done) toast({ message: done, tone: "success" });
      await onChanged();
    }
    return r;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 truncate text-[20px] font-semibold leading-7 text-fg">{appt.customer.name}</h2>
          <Dot tone={s.tone} className="mt-1.5">{s.label}</Dot>
        </div>
        <p className="text-meta text-fg-muted tabular">
          {[appt.customer.phone ? maskPhone(appt.customer.phone) : "No phone yet", LANG[appt.customer.language]].join(" · ")}
        </p>
        <p className="mt-1 text-meta text-fg-muted">
          {dateLabel(start.date, { weekday: "short", month: "short", day: "numeric" })}, {clock(start.minutes)} · {appt.staffName ?? "Not placed yet"}
          {appt.requestedStaff ? " · asked for by name" : ""}
        </p>
      </div>

      {appt.pet ? (
        <div className="rounded-input border border-line px-3 py-2.5" data-testid="appt-pet">
          <p className="text-body-strong text-fg">{appt.pet.name}</p>
          <p className="text-meta text-fg-muted">{[appt.pet.breed, `${appt.pet.sizeBand} ${appt.pet.species}`, `${appt.pet.coat.replace("_", " ")} coat`].filter(Boolean).join(" · ")}</p>
          {appt.pet.handlingNote ? <p className="mt-1.5 text-meta text-fg"><span className="font-medium">Handling:</span> {appt.pet.handlingNote}</p> : null}
          <p className={`mt-1.5 text-caption ${appt.pet.vaccines === "expired" ? "text-negative" : appt.pet.vaccines === "expiring" ? "text-fg" : "text-fg-muted"}`}>
            {appt.pet.vaccines === "expired" ? "A vaccine has expired." : appt.pet.vaccines === "expiring" ? "A vaccine expires soon." : appt.pet.vaccines === "none" ? "No vaccine dates on file." : "Vaccines are current."}{" "}
            <a className="underline underline-offset-2" href={`${base}/pets/${appt.pet.id}`}>Open {appt.pet.name}</a>
          </p>
        </div>
      ) : null}
      <ul className="divide-y divide-line border-y border-line">
        {appt.items.map((i, idx) => (
          <li key={`${i.name}${idx}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-body-strong text-fg">{i.name}</p>
              <p className="text-meta text-fg-muted">{i.durationMin ? `${duration(i.durationMin)}${appt.staffName ? ` with ${appt.staffName.split(" ")[0]}` : ""}` : "No time"}</p>
            </div>
            <p className="shrink-0 text-body tabular text-fg">{money(i.priceCents)}</p>
          </li>
        ))}
        {appt.depositPaidAt ? (
          <li className="flex items-center justify-between gap-3 py-2.5 text-meta">
            <span className="text-fg-muted">Deposit paid online</span>
            <span className="text-positive-text tabular">-{money(due.depositCents)}</span>
          </li>
        ) : appt.holdExpiresAt ? (
          <li className="flex items-center justify-between gap-3 py-2.5 text-meta">
            <span className="text-fg-muted">Waiting for the {money(appt.depositCents)} deposit</span>
            <span className="text-fg-muted">held</span>
          </li>
        ) : null}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-body-strong text-fg">Due at checkout</span>
          <span className="text-body-strong tabular text-fg">{money(due.dueCents)}</span>
        </li>
      </ul>
      <p className="-mt-3 text-caption text-fg-muted">{duration(minutes)} of work. {taxStatus === "registered" ? "Tax is added when you check out." : taxStatus === "small" ? "No tax is added: you are set as a small supplier." : taxStatus === "unset" ? "No tax is added yet because your tax status is not set." : ""}</p>
      {taxStatus === "unset" ? <p className="-mt-3 text-caption"><a className="text-fg underline underline-offset-2" href={`${base}/settings?tab=tax`}>Set your tax status</a></p> : null}

      {appt.clientNote || appt.notes ? (
        <div className="rounded-input bg-bg-subtle px-3 py-2.5">
          <p className="text-caption text-fg-muted">{appt.clientNote ? "Client note" : "Note"}</p>
          <p className="text-meta text-fg">{appt.clientNote ?? appt.notes}</p>
        </div>
      ) : null}

      {detail.data?.lastVisits.length ? (
        <div>
          <p className="text-caption text-fg-muted">Last visits</p>
          <ul className="mt-1 text-meta text-fg">
            {detail.data.lastVisits.map((v) => (
              <li key={v.id}>{formatDate(v.startsAt)} · {v.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {appt.hasCardOnFile && appt.noShowFeeCents ? <p className="text-caption text-fg-muted">Card on file. A {money(appt.noShowFeeCents)} no-show fee can be charged.</p> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {appt.status === "booked" ? (
          <Button size="lg" fullWidth loading={act.busy} onClick={() => run(() => api.appointments.checkIn(appt.id), `${appt.customer.name} checked in`)}>Check in</Button>
        ) : null}
        {appt.status === "arrived" ? (
          <Button size="lg" fullWidth loading={act.busy} onClick={() => run(() => api.appointments.status(appt.id, { status: "in_service", chargeFee: false }), "Started")}>Start service</Button>
        ) : null}
        {live || unpaidDone ? (
          <Button size="lg" variant={appt.status === "in_service" || unpaidDone ? "primary" : "secondary"} fullWidth onClick={onCheckout}>
            Check out, {money(due.dueCents)} + tip
          </Button>
        ) : null}
        {live ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMoving(true)}>Reschedule</Button>
            <Button variant="secondary" size="sm" onClick={() => setNoShow(true)}>No-show</Button>
            <Button variant="ghost" size="sm" onClick={() => setCancel(true)}>Cancel</Button>
          </div>
        ) : null}
        {appt.status === "no_show" && fee > 0 && appt.hasCardOnFile && !appt.feeChargedAt ? (
          <Button variant="secondary" size="sm" loading={act.busy} onClick={() => run(() => api.appointments.status(appt.id, { status: "no_show", chargeFee: true }), `Charged ${money(fee)}`)}>Charge the {money(fee)} fee</Button>
        ) : null}
      </div>

      <Modal
        open={noShow}
        onClose={() => setNoShow(false)}
        title="Mark as a no-show?"
        description={appt.hasCardOnFile && fee > 0 ? `${appt.customer.name} has a card on file. Charge the ${money(fee)} fee?` : appt.noShowFeeCents ? `There's no card on file for ${appt.customer.name}, so the fee can't be charged.` : `${appt.customer.name} didn't come.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setNoShow(false)}>Back</Button>
            {appt.hasCardOnFile && fee > 0 ? (
              <Button variant="secondary" loading={act.busy} onClick={async () => { const r = await run(() => api.appointments.status(appt.id, { status: "no_show", chargeFee: false }), "Marked as a no-show"); if (r !== undefined) setNoShow(false); }}>No fee</Button>
            ) : null}
            <Button
              loading={act.busy}
              onClick={async () => {
                const charge = appt.hasCardOnFile && fee > 0;
                const r = await run(() => api.appointments.status(appt.id, { status: "no_show", chargeFee: charge }), charge ? `Charged ${money(fee)}` : "Marked as a no-show");
                if (r !== undefined) setNoShow(false);
                // The no-show stands even when the card can't be charged: show it, and let staff try again.
                else await onChanged();
              }}
            >
              {appt.hasCardOnFile && fee > 0 ? `Charge ${money(fee)}` : "Mark as no-show"}
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={cancel}
        onClose={() => setCancel(false)}
        title="Cancel this appointment?"
        body={appt.depositPaidAt ? `${appt.customer.name} paid a ${money(appt.depositCents)} deposit. It goes back to their card.` : `The time opens up for someone else.`}
        confirmLabel="Cancel appointment"
        danger
        onConfirm={async () => {
          await api.appointments.status(appt.id, { status: "cancelled", chargeFee: false });
          toast({ message: "Appointment cancelled", tone: "success" });
          await onChanged();
        }}
      />
      <RescheduleDialog open={moving} onClose={() => setMoving(false)} appt={appt} staff={staff} manager={role !== "staff"} onSaved={async () => { setMoving(false); toast({ message: "Appointment moved", tone: "success" }); await onChanged(); }} />
    </div>
  );
}

function RescheduleDialog({ open, onClose, appt, staff, manager, onSaved }: { open: boolean; onClose: () => void; appt: Appt; staff: appointmentsApi.BookableStaffDto[]; manager: boolean; onSaved: () => void | Promise<void> }) {
  const { api } = useMerchant();
  const p = parts(appt.startsAt);
  const [date, setDate] = useState(p.date);
  const [time, setTime] = useState(`${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}`);
  const [staffId, setStaffId] = useState(appt.staffId ?? "");
  const [force, setForce] = useState(false);
  const [confirmStaff, setConfirmStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  async function save() {
    const [hh, mm] = time.split(":").map(Number) as [number, number];
    const startsAt = instantAt(date, hh * 60 + mm);
    const len = new Date(appt.endsAt).getTime() - new Date(appt.startsAt).getTime();
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      await api.appointments.update(appt.id, { startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + len).toISOString(), staffId: staffId || null, confirmStaffChange: confirmStaff, force });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e)) setCode(e.code);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Move appointment</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="Time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Select label="Stylist" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: "", label: "Not placed yet" }, ...staff.map((s) => ({ value: s.userId, label: s.name }))]} />
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {code === "requested_staff" ? (
          <label className="flex items-center gap-2 text-meta text-fg"><input type="checkbox" checked={confirmStaff} onChange={(e) => setConfirmStaff(e.target.checked)} className="size-4" />Move them to someone else anyway</label>
        ) : null}
        {code === "outside_hours" && manager ? (
          <label className="flex items-center gap-2 text-meta text-fg"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4" />Move anyway, outside working hours</label>
        ) : null}
      </div>
    </Modal>
  );
}

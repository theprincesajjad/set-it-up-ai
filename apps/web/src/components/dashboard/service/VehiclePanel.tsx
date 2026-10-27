"use client";
import { useEffect, useState } from "react";
import { PARTS_RETURN, PARTS_RETURN_LABELS, estimateMissing, type serviceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/**
 * A vehicle ticket's Ontario checklist (docs/research/auto-care.md 2.4): what the written estimate still needs, the odometer out and what
 * happened to the replaced parts for the invoice, and the services done this visit so the reminders count from today.
 */
export function VehiclePanel({ ticket, quote, onSaved, closed }: { ticket: serviceApi.TicketDto; quote: serviceApi.QuoteDto | null; onSaved: (d: serviceApi.TicketDetailResponse) => void; closed: boolean }) {
  const { api, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const d = ticket.itemDetails;
  const [out, setOut] = useState(d.mileageOut ?? "");
  const [parts, setParts] = useState(d.partsReturn ?? "");
  const vehicleId = d.vehicleId;
  const car = useApi(vehicleId && enabled("auto.vehicles") ? () => api.auto.vehicle(vehicleId) : null, [api, vehicleId]);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    // The saved values change when the ticket reloads.
    /* eslint-disable react-hooks/set-state-in-effect */
    setOut(d.mileageOut ?? "");
    setParts(d.partsReturn ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [d.mileageOut, d.partsReturn]);
  const label = [d.year, d.make, d.model].filter(Boolean).join(" ");
  const missing = estimateMissing({
    vehicleLabel: label || null,
    mileageIn: d.mileage ?? null,
    promisedAt: ticket.promisedAt,
    // The expiry is set when the estimate is sent (7 days by default), so it is only missing before an estimate exists.
    expiresAt: quote?.expiresAt ?? "pending",
    lines: (quote?.lineItems ?? []).map((l) => ({ kind: l.kind, condition: l.condition ?? null, description: l.description })),
  });
  async function save() {
    const next = { ...d, ...(out.trim() ? { mileageOut: out.trim() } : {}), ...(parts ? { partsReturn: parts } : {}) };
    if (!out.trim()) delete (next as Record<string, string>).mileageOut;
    const r = await act.run(() => api.serviceOps.updateTicket(ticket.id, { itemDetails: next }));
    if (r) {
      onSaved(r);
      toast({ message: "Saved for the invoice", tone: "success" });
    }
  }
  async function logDone() {
    if (!vehicleId || !done.length) return;
    const km = Number((out || d.mileage || "").replace(/[^\d]/g, "")) || undefined;
    const r = await act.run(async () => {
      let last;
      for (const key of done) last = await api.auto.logService(vehicleId, { serviceKey: key, km });
      return last;
    });
    if (r) {
      toast({ message: `${done.length} ${done.length === 1 ? "service" : "services"} logged. The reminders count from today.`, tone: "success" });
      setDone([]);
      await car.reload();
    }
  }
  return (
    <Panel title="Vehicle and estimate" description="The Ontario guide for auto repair businesses asks for these on the estimate and the invoice.">
      <p className="text-body text-fg">{label || "Vehicle"}{d.plate ? <span className="ms-2 text-meta text-fg-muted">plate {d.plate}</span> : null}{d.mileage ? <span className="ms-2 text-meta text-fg-muted">in at {d.mileage} km</span> : null}</p>
      {!closed ? (
        missing.length ? (
          <Banner tone="info" title="The estimate still needs">{missing.join(", ")}.</Banner>
        ) : (
          <p className="mt-2 text-meta text-fg-muted">The estimate has everything the guide asks for.</p>
        )
      ) : null}
      {act.error ? <div className="mt-3"><Banner tone="danger">{act.error}</Banner></div> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField label="Odometer out (km)" optionalLabel inputMode="numeric" value={out} onChange={(e) => setOut(e.target.value)} hint="When the car goes back to the customer." />
        <Select label="Replaced parts" value={parts} onChange={(e) => setParts(e.target.value)} placeholder="Not recorded" options={PARTS_RETURN.map((k) => ({ value: k, label: PARTS_RETURN_LABELS[k] }))} />
      </div>
      <Button className="mt-3" size="sm" variant="secondary" loading={act.busy} onClick={() => void save()}>Save for the invoice</Button>
      {car.data ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-meta-strong text-fg">Services done this visit</p>
          <p className="text-meta text-fg-muted">Tick what was done so the reminders count from today.</p>
          <div className="mt-2 flex flex-col gap-2">
            {car.data.reminders.map((r) => <Checkbox key={r.serviceKey} label={r.label} checked={done.includes(r.serviceKey)} onChange={(v) => setDone(v ? [...done, r.serviceKey] : done.filter((k) => k !== r.serviceKey))} />)}
          </div>
          <Button className="mt-3" size="sm" variant="secondary" disabled={!done.length || act.busy} onClick={() => void logDone()}>Log to the vehicle</Button>
        </div>
      ) : null}
    </Panel>
  );
}

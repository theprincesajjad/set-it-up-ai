"use client";
import { Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { autoApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel, SkeletonRows, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { shortDate } from "@/lib/dashboard/auto";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function ServiceRemindersPage() {
  return (
    <FeatureGate keys={["auto.vehicles"]} title="Service reminders">
      <Reminders />
    </FeatureGate>
  );
}

/** Service reminders (Figma frame 2): cars due or overdue by km or months. One text per car, service and due date, only to owners who said yes. */
function Reminders() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [panel, setPanel] = useState(false);
  const state = useApi(() => api.auto.reminders(), [api]);
  const settings = useApi(() => api.auto.settings(), [api]);
  const d = state.data;
  const sendable = d?.items.filter((i) => i.canSend).length ?? 0;
  async function send(body: { items?: { vehicleId: string; serviceKey: string }[]; skip?: boolean }, ok: (r: { sent: number; skipped: number }) => string) {
    const r = await act.run(() => api.auto.sendReminders(body));
    if (r) toast({ message: ok(r), tone: "success" });
    await state.reload();
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Service reminders"
        description="Cars that need something soon, by km or months, whichever comes first. One text per car, service and due date, only to owners who said yes, never overnight."
        actions={
          <>
            {role !== "staff" ? <Button size="sm" variant="secondary" iconStart={Settings} onClick={() => setPanel(true)}>Intervals</Button> : null}
            <Button size="sm" disabled={!sendable} loading={act.busy} onClick={() => void send({}, (r) => `${r.sent} ${r.sent === 1 ? "text" : "texts"} sent`)}>{`Text all due (${sendable})`}</Button>
          </>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StatBlock
        label="Service reminders"
        loading={!d}
        items={[
          { label: "Due soon", value: d?.counts.dueSoon ?? 0, caption: "within 14 days or 1,000 km" },
          { label: "Overdue", value: d?.counts.overdue ?? 0, caption: "past their date", dot: d && d.counts.overdue ? "accent" : undefined },
          { label: "Texted this week", value: d?.counts.texted7d ?? 0, caption: "reminders sent" },
          { label: "No odometer in 6 months", value: d?.counts.noReading ?? 0, caption: "km dates are guesses" },
        ]}
      />
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>
        {(r) =>
          r.items.length === 0 ? (
            <Empty>Nothing is due. Log a service on a vehicle and it shows here before it is due.</Empty>
          ) : (
            <TableWrap>
              <Table label="Cars due for service">
                <thead>
                  <tr>
                    <Th>Vehicle and owner</Th>
                    <Th>Service</Th>
                    <Th>Due</Th>
                    <Th>Last text</Th>
                    <Th align="end">Reminder</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <Tr key={`${i.vehicleId}:${i.serviceKey}`}>
                      <Td>
                        <Link href={`${base}/vehicles/${i.vehicleId}`} className="font-medium text-fg hover:underline">{i.vehicleLabel}</Link>
                        <div className="text-meta text-fg-muted">{i.ownerName ?? "No name"}</div>
                      </Td>
                      <Td>{i.label}</Td>
                      <Td>
                        <span className="me-2">{shortDate(i.dueOn)} by {i.basis}</span>
                        <Dot tone={i.status === "overdue" ? "negative" : "accent"}>{i.status === "overdue" ? "Overdue" : "Due soon"}</Dot>
                      </Td>
                      <Td className="text-fg-muted">{i.lastTextOn ? shortDate(i.lastTextOn) : "None yet"}</Td>
                      <Td align="end">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void send({ items: [{ vehicleId: i.vehicleId, serviceKey: i.serviceKey }], skip: true }, () => `Skipped for this due date`)}>Skip</Button>
                          <Button size="sm" disabled={!i.canSend || act.busy} onClick={() => void send({ items: [{ vehicleId: i.vehicleId, serviceKey: i.serviceKey }] }, () => `Text sent about ${i.vehicleLabel}`)}>{i.canSend ? "Send text" : i.cannotWhy ?? "Cannot text"}</Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        }
      </Async>
      <AutoToggle settings={settings.data} reload={settings.reload} />
      {d ? (
        <div className="flex flex-col gap-1.5 rounded-card bg-bg-subtle px-5 py-4">
          <p className="text-meta text-fg-muted">What the owner gets (in English; in their own language if they set one). The plate is never in it.</p>
          <p className="text-body text-fg">{d.previewText}</p>
        </div>
      ) : null}
      {settings.data ? <Intervals open={panel} onClose={() => setPanel(false)} settings={settings.data} onSaved={() => { void settings.reload(); void state.reload(); }} /> : null}
    </div>
  );
}

function AutoToggle({ settings, reload }: { settings: autoApi.AutoSettingsDto | null; reload: () => Promise<unknown> }) {
  const { api, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  return (
    <label className="flex items-start gap-2 text-body text-fg">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={settings?.autoReminders ?? false}
        disabled={!settings || role === "staff" || act.busy}
        onChange={async (e) => {
          const r = await act.run(() => api.auto.saveSettings({ autoReminders: e.target.checked }));
          if (r) toast({ message: r.autoReminders ? "Reminders go out at 10:00 on their own" : "Reminders are manual again", tone: "success" });
          await reload();
        }}
      />
      <span>Text owners automatically when a service is due (10:00, once per due date, only owners who said yes)</span>
    </label>
  );
}

/** The shop's service intervals: km and months, and the shorter set used for ride-hail cars. The owner's manual wins; these are defaults. */
function Intervals({ open, onClose, settings, onSaved }: { open: boolean; onClose: () => void; settings: autoApi.AutoSettingsDto; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [rows, setRows] = useState(settings.services);
  const [perDay, setPerDay] = useState(String(settings.defaultKmPerDay));
  useEffect(() => {
    // Start from what is saved each time the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setRows(settings.services); setPerDay(String(settings.defaultKmPerDay)); }
  }, [open, settings]);
  const num = (s: string): number | null => (s.trim() ? Number(s.replace(/[^\d]/g, "")) || null : null);
  const set = (i: number, patch: Partial<autoApi.AutoServiceDto>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      width={560}
      label="Service intervals"
      title="Service intervals"
      subtitle="Km or months, whichever comes first. Check the owner's manual; these are starting points."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              const r = await act.run(() => api.auto.saveSettings({ services: rows, defaultKmPerDay: Number(perDay.replace(/[^\d]/g, "")) || settings.defaultKmPerDay }));
              if (r) {
                toast({ message: "Intervals saved", tone: "success" });
                onSaved();
                onClose();
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {rows.map((s, i) => (
          <fieldset key={s.key} className="flex flex-col gap-3 rounded-card border border-line p-4">
            <legend className="px-1 text-meta-strong text-fg">{s.label}</legend>
            <Checkbox label="Remind for this service" checked={s.active} onChange={(v) => set(i, { active: v })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Every (km)" inputMode="numeric" optionalLabel value={s.everyKm ? String(s.everyKm) : ""} onChange={(e) => set(i, { everyKm: num(e.target.value) })} />
              <TextField label="Every (months)" inputMode="numeric" optionalLabel value={s.everyMonths ? String(s.everyMonths) : ""} onChange={(e) => set(i, { everyMonths: num(e.target.value) })} />
              <TextField label="Ride-hail: km" inputMode="numeric" optionalLabel value={s.severeKm ? String(s.severeKm) : ""} onChange={(e) => set(i, { severeKm: num(e.target.value) })} />
              <TextField label="Ride-hail: months" inputMode="numeric" optionalLabel value={s.severeMonths ? String(s.severeMonths) : ""} onChange={(e) => set(i, { severeMonths: num(e.target.value) })} />
            </div>
          </fieldset>
        ))}
        <TextField label="Km a day when a car has no readings yet" inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} hint="An estimate. It is replaced by the car's own readings." />
      </div>
    </SidePanel>
  );
}

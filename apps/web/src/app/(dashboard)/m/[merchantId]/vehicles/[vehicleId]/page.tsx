"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { BackLink, DefList, Dot, PageHeader, Panel, SkeletonRows, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { dueText, kmLabel, overText, reminderTag, seasonLabel, shortDate, treadTag } from "@/lib/dashboard/auto";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { formatMoney } from "@/lib/format";

export default function VehiclePage() {
  return (
    <FeatureGate keys={["auto.vehicles"]} title="Vehicle">
      <Vehicle />
    </FeatureGate>
  );
}

/** One vehicle (Figma frame 1): what is due by km or months, the odometer, the visits with their estimates, and the rules. */
function Vehicle() {
  const { api, base } = useMerchant();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.auto.vehicle(vehicleId), [api, vehicleId]);
  const [km, setKm] = useState("");
  const [plate, setPlate] = useState("");
  const [perDay, setPerDay] = useState("");
  const [note, setNote] = useState("");
  const [rideshare, setRideshare] = useState(false);
  const v = state.data;
  useEffect(() => {
    if (!v) return;
    // Fill the edit fields once when the vehicle loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlate(v.plate ?? "");
    setNote(v.note ?? "");
    setRideshare(v.use === "rideshare");
    setPerDay(v.kmPerDayBasis === "override" ? String(v.kmPerDay) : "");
  }, [v?.id, v?.kmPerDayBasis]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run<R>(fn: () => Promise<R>, ok: string) {
    const r = await act.run(fn);
    if (r) {
      toast({ message: ok, tone: "success" });
      await state.reload();
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`${base}/vehicles`}>Vehicles</BackLink>
      <Async state={state} skeleton={<SkeletonRows rows={6} />}>
        {(d) => (
          <>
            <PageHeader
              flush
              title={d.label}
              description={`${d.ownerName ?? "No name"}${d.plate ? ` · plate ${d.plate} (staff only)` : ""} · ${d.odometerKm != null ? `${kmLabel(d.odometerKm)} on ${shortDate(d.odometerOn)}` : "no odometer reading yet"} · about ${d.kmPerDay} km a day (${d.kmPerDayBasis === "readings" ? "from the last readings" : d.kmPerDayBasis === "override" ? "set by you" : "the shop default"})`}
              actions={<Button size="sm" href={`${base}/tickets/new?vehicleId=${d.id}`}>Start an estimate</Button>}
            />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col gap-6">
                <Panel title="Service reminders" description="Due by km or months, whichever comes first. Dates are estimates from the odometer readings." padded={false}>
                  <TableWrap>
                    <Table label="Service reminders">
                      <thead>
                        <tr>
                          <Th>Service</Th>
                          <Th>Every</Th>
                          <Th>Last done</Th>
                          <Th>Next due</Th>
                          <Th align="end">Done</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.reminders.map((r) => {
                          const tag = reminderTag(r.status);
                          return (
                            <Tr key={r.serviceKey}>
                              <Td className="font-medium">{r.label}</Td>
                              <Td className="text-fg-muted">{r.every}</Td>
                              <Td className="whitespace-normal text-fg-muted">{r.lastDoneOn ? `${shortDate(r.lastDoneOn)}${r.lastKm != null ? ` · ${kmLabel(r.lastKm)}` : ""}` : "Never logged"}</Td>
                              <Td className="whitespace-normal">
                                <div>{dueText(r)}</div>
                                <Dot tone={tag.tone}>{tag.label}</Dot>
                              </Td>
                              <Td align="end">
                                <Button size="sm" variant="secondary" disabled={act.busy} aria-label={`Mark ${r.label} done today`} onClick={() => void run(() => api.auto.logService(d.id, { serviceKey: r.serviceKey, km: d.odometerKm ?? undefined }), `${r.label} logged for today`)}>Done today</Button>
                              </Td>
                            </Tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </TableWrap>
                </Panel>
                <Panel title="Visits" description="Each repair ticket for this car, with its estimate beside the invoice." padded={false}>
                  {d.visits.length === 0 ? (
                    <p className="px-5 py-4 text-meta text-fg-muted">No tickets for this car yet.</p>
                  ) : (
                    <TableWrap>
                      <Table label="Visits">
                        <thead>
                          <tr>
                            <Th>Ticket</Th>
                            <Th>What</Th>
                            <Th>Odometer</Th>
                            <Th>Estimate and invoice</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.visits.map((t) => (
                            <Tr key={t.ticketId}>
                              <Td><a className="font-medium text-fg hover:underline" href={`${base}/tickets/${t.ticketId}`}>#{t.number}</a><div className="text-meta text-fg-muted">{shortDate(t.at.slice(0, 10))}</div></Td>
                              <Td>{t.issue}</Td>
                              <Td className="text-fg-muted">{t.mileageIn ? `${t.mileageIn} km` : ""}</Td>
                              <Td className="text-fg-muted">
                                {t.estimateCents != null ? `Estimate ${formatMoney(t.estimateCents)}` : "No estimate"}
                                {t.invoiceCents != null ? `, invoice ${formatMoney(t.invoiceCents)}${t.percentOver != null ? ` (${overText(t.percentOver)})` : ""}` : ""}
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </TableWrap>
                  )}
                </Panel>
                {d.tireSets.length ? (
                  <Panel title="Tires in storage" padded={false}>
                    <TableWrap>
                      <Table label="Stored tires">
                        <thead><tr><Th>Rack</Th><Th>Set</Th><Th>Tread</Th></tr></thead>
                        <tbody>
                          {d.tireSets.map((s) => (
                            <Tr key={s.id}>
                              <Td className="font-medium">{s.rack}</Td>
                              <Td className="text-fg-muted">{seasonLabel(s.season)}{s.label ? `, ${s.label}` : ""}</Td>
                              <Td>{s.treadMm != null ? `${s.treadMm.toFixed(1)} mm ` : ""}<Dot tone={treadTag(s.treadStatus).tone}>{treadTag(s.treadStatus).label}</Dot></Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </TableWrap>
                  </Panel>
                ) : null}
              </div>
              <div className="flex flex-col gap-6">
                <Panel title="Log odometer">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const n = Number(km.replace(/[^\d]/g, ""));
                      if (!n) return;
                      await run(() => api.auto.addReading(d.id, { km: n }), "Reading saved");
                      setKm("");
                    }}
                  >
                    <TextField label="New reading at the counter (km)" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
                    <Button type="submit" size="sm" className="self-start" loading={act.busy} disabled={!km.trim()}>Save reading</Button>
                  </form>
                </Panel>
                <Panel title="This car">
                  <DefList items={[{ label: "Owner", value: `${d.ownerName ?? "No name"}${d.canText ? ", texts ok" : ", no texts"}` }, { label: "Plate", value: d.plate ?? "None on file" }]} />
                  <div className="mt-4 flex flex-col gap-3">
                    <TextField label="Plate" optionalLabel value={plate} onChange={(e) => setPlate(e.target.value)} hint="Staff only. Never in a text." />
                    <TextField label="Km a day (set it if the owner tells you)" optionalLabel inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} hint="Leave empty to estimate it from the readings." />
                    <TextField label="Note" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} />
                    <Checkbox label="Ride-hail or delivery car (shorter service intervals)" checked={rideshare} onChange={setRideshare} />
                    <Button size="sm" className="self-start" variant="secondary" loading={act.busy} onClick={() => void run(() => api.auto.saveVehicle(d.id, { plate: plate.trim() || null, use: rideshare ? "rideshare" : "personal", kmPerDayOverride: perDay.trim() ? Number(perDay.replace(/[^\d]/g, "")) : null, note: note.trim() || null }), "Saved")}>Save</Button>
                  </div>
                </Panel>
                <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg-muted">A reminder text goes out once for each service and due date, 14 days or 1,000 km before, only to owners who said yes to texts. It names the service and the car&apos;s make and model, never the plate.</p>
              </div>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}

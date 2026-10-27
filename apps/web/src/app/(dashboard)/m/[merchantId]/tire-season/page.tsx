"use client";
import { Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { autoApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, Meter, PageHeader, SidePanel, SkeletonRows, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { MemberPicker, type PickedMember } from "@/components/dashboard/pets/MemberPicker";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { dayLabel, seasonLabel, shortDate, treadTag, windowLabel } from "@/lib/dashboard/auto";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function TireSeasonPage() {
  return (
    <FeatureGate keys={["auto.tires"]} title="Tire season">
      <TireSeason />
    </FeatureGate>
  );
}

const SEASONS = [{ value: "winter", label: "Winter" }, { value: "summer", label: "Summer" }, { value: "all_weather", label: "All-weather" }];

/** Tire season (Figma frame 3): the swap windows with a capacity plan by day, and the tire hotel. A full day takes no more bookings. */
function TireSeason() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const plan = useApi(() => api.auto.tirePlan({ days: 14 }), [api]);
  const sets = useApi(() => api.auto.tireSets("stored"), [api]);
  const [book, setBook] = useState(false);
  const [cfg, setCfg] = useState(false);
  const [edit, setEdit] = useState<autoApi.TireSetDto | "new" | null>(null);
  const p = plan.data;
  const week = p?.days.slice(0, 7) ?? [];
  const bookedWeek = week.reduce((n, d) => n + d.booked, 0);
  const capWeek = week.reduce((n, d) => n + d.capacity, 0);
  async function run<R>(fn: () => Promise<R>, ok: string) {
    const r = await act.run(fn);
    if (r) {
      toast({ message: ok, tone: "success" });
      await Promise.all([plan.reload(), sets.reload()]);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Tire season"
        description={p ? `${windowLabel(p.window)}${p.window.open ? "" : ", not open yet"}. ${p.settings.swapsPerDay} swaps a day (${p.settings.bays} ${p.settings.bays === 1 ? "bay" : "bays"} x ${p.settings.hoursPerDay} hours, ${p.settings.minutesPerSwap} minutes a swap).` : "Swap windows, capacity by day and the tire hotel."}
        actions={
          <>
            {role !== "staff" ? <Button size="sm" variant="secondary" iconStart={Settings} onClick={() => setCfg(true)}>Windows and capacity</Button> : null}
            <Button size="sm" iconStart={Plus} onClick={() => setBook(true)}>Add a swap booking</Button>
          </>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StatBlock
        label="Tire season"
        loading={!p || !sets.data}
        items={[
          { label: "Booked, next 7 days", value: `${bookedWeek} of ${capWeek}`, caption: "swaps against capacity" },
          { label: "Full days", value: week.filter((d) => d.full).length, caption: "in the next 7 days", dot: week.some((d) => d.full) ? "accent" : undefined },
          { label: "Sets stored", value: sets.data?.counts.stored ?? 0, caption: `${sets.data?.counts.racks ?? 0} racks` },
          { label: "Replace soon", value: sets.data?.counts.replaceSoon ?? 0, caption: "tread under 3.2 mm" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-6">
          <Async state={plan} skeleton={<SkeletonRows rows={7} />}>
            {(r) => (
              <>
                <TableWrap>
                  <Table label="Capacity plan, next 14 days">
                    <thead>
                      <tr>
                        <Th>Day</Th>
                        <Th>Booked</Th>
                        <Th>Filled</Th>
                        <Th align="end">Free</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.days.map((d) => (
                        <Tr key={d.day}>
                          <Td>
                            <span className="font-medium">{dayLabel(d.day)}</span>
                            {d.window ? <span className="ms-2 text-meta text-fg-muted">{d.window}</span> : null}
                          </Td>
                          <Td className="tabular-nums">{d.booked} of {d.capacity}</Td>
                          <Td className="min-w-[120px]"><Meter value={d.booked} max={Math.max(1, d.capacity)} label={`${dayLabel(d.day)} is ${d.booked} of ${d.capacity} booked`} tone={d.full ? "fg" : "accent"} /></Td>
                          <Td align="end">{d.full ? <Dot tone="negative">Full</Dot> : <span className="tabular-nums">{d.free}</span>}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                <div className="flex flex-col gap-2">
                  <h2 className="text-headline text-fg">Swaps</h2>
                  {r.swaps.length === 0 ? (
                    <Empty>No swaps booked in the next 14 days.</Empty>
                  ) : (
                    <ul className="divide-y divide-line rounded-card border border-line">
                      {r.swaps.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-body text-fg">{dayLabel(s.day)} · {s.ownerName ?? "No name"}</div>
                            <div className="truncate text-meta text-fg-muted">{[s.vehicleLabel, s.tireSetRack ? `rack ${s.tireSetRack}` : null, s.source === "customer" ? "booked online" : "booked by staff"].filter(Boolean).join(" · ")}</div>
                          </div>
                          {s.status === "booked" ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => void run(() => api.auto.swapStatus(s.id, "no_show"), "Marked no-show")}>No-show</Button>
                              <Button size="sm" disabled={act.busy} onClick={() => void run(() => api.auto.swapStatus(s.id, "done"), "Swap done")}>Done</Button>
                            </div>
                          ) : (
                            <Dot tone={s.status === "done" ? "positive" : "negative"}>{s.status === "done" ? "Done" : "No-show"}</Dot>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Async>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-headline text-fg">Tire hotel</h2>
            <div className="flex gap-2">
              {role !== "staff" ? <Button size="sm" variant="secondary" loading={act.busy} onClick={() => void run(async () => { const r = await api.auto.sendPickupTexts(); toast({ message: `${r.sent} pickup ${r.sent === 1 ? "text" : "texts"} sent`, tone: "success" }); return r; }, "Pickup texts done")}>Text pickup reminders</Button> : null}
              <Button size="sm" iconStart={Plus} onClick={() => setEdit("new")}>Store a set</Button>
            </div>
          </div>
          <Async state={sets} skeleton={<SkeletonRows rows={5} />}>
            {(r) =>
              r.items.length === 0 ? (
                <Empty>No sets in storage.</Empty>
              ) : (
                <TableWrap>
                  <Table label="Stored tires">
                    <thead>
                      <tr>
                        <Th>Rack</Th>
                        <Th>Customer and car</Th>
                        <Th>Set</Th>
                        <Th>Tread</Th>
                        <Th align="end">Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.items.map((s) => {
                        const tag = treadTag(s.treadStatus);
                        return (
                          <Tr key={s.id}>
                            <Td className="font-medium">{s.rack}</Td>
                            <Td>
                              {s.ownerName ?? "No name"}
                              <div className="text-meta text-fg-muted">{s.vehicleId ? <Link href={`${base}/vehicles/${s.vehicleId}`} className="hover:underline">{s.vehicleLabel}</Link> : "No car linked"}</div>
                            </Td>
                            <Td className="whitespace-normal">
                              <span className="text-fg">{seasonLabel(s.season)}{s.label ? `, ${s.label}` : ""}</span>
                              <div className="text-meta text-fg-muted">{s.pickupWindow ? (s.pickupTexted ? "Pickup text sent" : `Pickup text ${shortDate(s.pickupTextOn)}`) : "No pickup text needed"}</div>
                            </Td>
                            <Td className="whitespace-normal">{s.treadMm != null ? <div className="tabular-nums">{s.treadMm.toFixed(1)} mm</div> : null}<Dot tone={tag.tone}>{tag.label}</Dot></Td>
                            <Td align="end">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="secondary" onClick={() => setEdit(s)}>Edit</Button>
                                <Button size="sm" disabled={act.busy} onClick={() => void run(() => api.auto.pickupTireSet(s.id), `${s.rack} picked up`)}>Picked up</Button>
                              </div>
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              )
            }
          </Async>
          <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg-muted">Tread is measured in mm. Under 3.2 mm (about 4/32 in) shows Replace soon; the wear bar is 1.6 mm (2/32 in). You decide what to tell the customer. The pickup text goes out once per window, {p?.settings.pickupLeadDays ?? 14} days before it opens, only to owners who said yes.</p>
        </div>
      </div>
      {p ? <BookSwap open={book} onClose={() => setBook(false)} days={p.days} onDone={() => void plan.reload()} /> : null}
      {p ? <Capacity open={cfg} onClose={() => setCfg(false)} settings={p.settings} onSaved={() => void plan.reload()} /> : null}
      <SetPanel edit={edit} onClose={() => setEdit(null)} onSaved={() => void Promise.all([sets.reload(), plan.reload()])} />
    </div>
  );
}

function BookSwap({ open, onClose, days, onDone }: { open: boolean; onClose: () => void; days: autoApi.TireDayDto[]; onDone: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [owner, setOwner] = useState<PickedMember | null>(null);
  const [day, setDay] = useState("");
  const [car, setCar] = useState("");
  const cars = useApi(open && owner ? async () => (await api.auto.vehicles({ q: owner.name ?? undefined })).items.filter((v) => v.ownerId === owner.userId) : null, [api, open, owner?.userId]);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Add a swap booking"
      title="Add a swap booking"
      subtitle="A full day takes no more bookings. Staff can book outside the window for a regular who phones in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!owner || !day}
            onClick={async () => {
              const r = await act.run(() => api.auto.bookSwap({ memberId: owner!.memberId, vehicleId: car || null, day }));
              if (r) {
                toast({ message: `Swap booked for ${dayLabel(day)}`, tone: "success" });
                setOwner(null); setDay(""); setCar("");
                onDone();
                onClose();
              }
            }}
          >
            Book swap
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <MemberPicker label="Customer" value={owner} onPick={(m) => { setOwner(m); setCar(""); }} />
        <Select label="Day" value={day} onChange={(e) => setDay(e.target.value)} placeholder="Pick a day" options={days.filter((d) => !d.full).map((d) => ({ value: d.day, label: `${dayLabel(d.day)}, ${d.free} left` }))} />
        {cars.data?.length ? <Select label="Car" value={car} onChange={(e) => setCar(e.target.value)} placeholder="Not sure" options={cars.data.map((v) => ({ value: v.id, label: v.label }))} /> : null}
      </div>
    </SidePanel>
  );
}

function Capacity({ open, onClose, settings, onSaved }: { open: boolean; onClose: () => void; settings: autoApi.AutoSettingsDto; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [f, setF] = useState({ bays: "", hoursPerDay: "", minutesPerSwap: "", fallStart: "", fallEnd: "", springStart: "", springEnd: "", pickupLeadDays: "" });
  useEffect(() => {
    // Start from what is saved each time the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setF({ bays: String(settings.bays), hoursPerDay: String(settings.hoursPerDay), minutesPerSwap: String(settings.minutesPerSwap), fallStart: settings.fallStart, fallEnd: settings.fallEnd, springStart: settings.springStart, springEnd: settings.springEnd, pickupLeadDays: String(settings.pickupLeadDays) });
  }, [open, settings]);
  const field = (k: keyof typeof f, label: string, hint?: string) => <TextField key={k} label={label} hint={hint} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  const n = (s: string) => Number(s.replace(/[^\d]/g, ""));
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Windows and capacity"
      title="Windows and capacity"
      subtitle="Swaps a day = bays x hours x 60 / minutes a swap."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              const r = await act.run(() => api.auto.saveSettings({ bays: n(f.bays), hoursPerDay: n(f.hoursPerDay), minutesPerSwap: n(f.minutesPerSwap), fallStart: f.fallStart.trim(), fallEnd: f.fallEnd.trim(), springStart: f.springStart.trim(), springEnd: f.springEnd.trim(), pickupLeadDays: n(f.pickupLeadDays) }));
              if (r) {
                toast({ message: `Saved: ${r.swapsPerDay} swaps a day`, tone: "success" });
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
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <div className="grid grid-cols-3 gap-3">
          {field("bays", "Bays")}
          {field("hoursPerDay", "Hours a day")}
          {field("minutesPerSwap", "Minutes a swap")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("fallStart", "Fall window opens", "Month-day, like 10-15")}
          {field("fallEnd", "Fall window closes", "Like 11-30")}
          {field("springStart", "Spring window opens", "Like 03-25")}
          {field("springEnd", "Spring window closes", "Like 04-30")}
        </div>
        {field("pickupLeadDays", "Days before a window to text stored-tire owners")}
      </div>
    </SidePanel>
  );
}

function SetPanel({ edit, onClose, onSaved }: { edit: autoApi.TireSetDto | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const creating = edit === "new";
  const [owner, setOwner] = useState<PickedMember | null>(null);
  const [rack, setRack] = useState("");
  const [season, setSeason] = useState("winter");
  const [label, setLabel] = useState("");
  const [tread, setTread] = useState("");
  const [car, setCar] = useState("");
  const [tried, setTried] = useState(false);
  const cars = useApi(creating && owner ? async () => (await api.auto.vehicles({ q: owner.name ?? undefined })).items.filter((v) => v.ownerId === owner.userId) : null, [api, creating, owner?.userId]);
  useEffect(() => {
    // Fill the form from the set being edited, or clear it for a new one.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (edit && edit !== "new") { setRack(edit.rack); setSeason(edit.season); setLabel(edit.label ?? ""); setTread(edit.treadMm != null ? String(edit.treadMm) : ""); }
    else { setRack(""); setSeason("winter"); setLabel(""); setTread(""); setOwner(null); setCar(""); setTried(false); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [edit]);
  const mm = tread.trim() ? Number(tread) : null;
  return (
    <SidePanel
      open={edit !== null}
      onClose={onClose}
      label={creating ? "Store a set" : "Edit a set"}
      title={creating ? "Store a set" : `Edit ${edit && typeof edit === "object" ? edit.rack : ""}`}
      subtitle="Rack, season and tread in mm. Measure at intake."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!rack.trim() || (creating && !owner) || (mm !== null && (Number.isNaN(mm) || mm < 0 || mm > 15))) return;
              const body = { rack: rack.trim(), season: season as "winter" | "summer" | "all_weather", label: label.trim() || null, treadMm: mm };
              const r = await act.run(() => (creating ? api.auto.addTireSet({ ...body, memberId: owner!.memberId, vehicleId: car || null }) : api.auto.saveTireSet((edit as autoApi.TireSetDto).id, body)));
              if (r) {
                toast({ message: creating ? `Stored on ${r.rack}` : "Saved", tone: "success" });
                onSaved();
                onClose();
              }
            }}
          >
            {creating ? "Store set" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {creating ? <MemberPicker label="Customer" value={owner} onPick={(m) => { setOwner(m); setCar(""); }} /> : null}
        {creating && tried && !owner ? <p className="text-meta text-negative">Pick the customer first.</p> : null}
        {creating && cars.data?.length ? <Select label="Car" value={car} onChange={(e) => setCar(e.target.value)} placeholder="Not linked" options={cars.data.map((v) => ({ value: v.id, label: v.label }))} /> : null}
        <TextField label="Rack" value={rack} onChange={(e) => setRack(e.target.value)} error={tried && !rack.trim() ? "Add the rack, like B-14" : undefined} autoComplete="off" />
        <Select label="Set" value={season} onChange={(e) => setSeason(e.target.value)} options={SEASONS} />
        <TextField label="Brand and size" optionalLabel value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Michelin 205/55R16" />
        <TextField label="Tread (mm)" optionalLabel inputMode="decimal" value={tread} onChange={(e) => setTread(e.target.value)} error={tried && mm !== null && (Number.isNaN(mm) || mm < 0 || mm > 15) ? "Between 0 and 15 mm" : undefined} />
      </div>
    </SidePanel>
  );
}

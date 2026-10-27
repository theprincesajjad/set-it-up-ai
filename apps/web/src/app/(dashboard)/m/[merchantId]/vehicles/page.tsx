"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel, SkeletonRows, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { MemberPicker, type PickedMember } from "@/components/dashboard/pets/MemberPicker";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { kmLabel, reminderTag, shortDate } from "@/lib/dashboard/auto";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function VehiclesPage() {
  return (
    <FeatureGate keys={["auto.vehicles"]} title="Vehicles">
      <Vehicles />
    </FeatureGate>
  );
}

/** Vehicles (docs/research/auto-care.md): the cars of this shop's customers, each with what is due next. */
function Vehicles() {
  const { api, base } = useMerchant();
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(false);
  const state = useApi(() => api.auto.vehicles({ q: q.trim() || undefined }), [api, q]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Vehicles" description="Your customers' cars with their odometer and what is due next. The plate is optional and only your staff see it." actions={<Button size="sm" iconStart={Plus} onClick={() => setAdd(true)}>Add a vehicle</Button>} />
      <div className="max-w-sm">
        <TextField label="Search vehicles" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Make, model, owner or plate" autoComplete="off" />
      </div>
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>
        {(r) =>
          r.items.length === 0 ? (
            <Empty action={<Button size="sm" onClick={() => setAdd(true)}>Add a vehicle</Button>}>{q ? "No vehicle matches that." : "No vehicles yet. Add a customer's car, or ask them to add it from their card."}</Empty>
          ) : (
            <TableWrap>
              <Table label="Vehicles">
                <thead>
                  <tr>
                    <Th>Vehicle</Th>
                    <Th>Owner</Th>
                    <Th>Odometer</Th>
                    <Th>Next due</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((v) => {
                    const tag = reminderTag(v.worst);
                    return (
                      <Tr key={v.id}>
                        <Td>
                          <Link href={`${base}/vehicles/${v.id}`} className="font-medium text-fg hover:underline">{v.label}</Link>
                          {v.plate ? <span className="ms-2 text-meta text-fg-muted">{v.plate}</span> : null}
                          {v.use === "rideshare" ? <span className="ms-2 text-meta text-fg-muted">ride-hail</span> : null}
                        </Td>
                        <Td className="text-fg-muted">{v.ownerName ?? "No name"}</Td>
                        <Td className="text-fg-muted">{v.odometerKm != null ? `${kmLabel(v.odometerKm)} on ${shortDate(v.odometerOn)}` : "No reading yet"}</Td>
                        <Td>
                          {v.nextDue ? (
                            <>
                              <span className="me-2">{v.nextDue.label}, {shortDate(v.nextDue.dueOn)}</span>
                              <Dot tone={tag.tone}>{tag.label}</Dot>
                            </>
                          ) : (
                            <span className="text-fg-muted">Nothing logged yet</span>
                          )}
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
      <AddVehicle open={add} onClose={() => setAdd(false)} onAdded={() => void state.reload()} />
    </div>
  );
}

function AddVehicle({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [owner, setOwner] = useState<PickedMember | null>(null);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [use, setUse] = useState("personal");
  const [km, setKm] = useState("");
  const [tried, setTried] = useState(false);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Add a vehicle"
      title="Add a vehicle"
      subtitle="A vehicle belongs to its owner and follows them to other shops."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!owner || !make.trim() || !model.trim()) return;
              const r = await act.run(() => api.auto.addVehicle({ memberId: owner.memberId, year: year ? Number(year) : null, make: make.trim(), model: model.trim(), use: use as "personal" | "rideshare", plate: plate.trim() || null, ...(km ? { odometerKm: Number(km.replace(/[^\d]/g, "")) } : {}) }));
              if (r) {
                toast({ message: `${r.label} added`, tone: "success" });
                setYear(""); setMake(""); setModel(""); setPlate(""); setKm(""); setOwner(null); setTried(false);
                onAdded();
                onClose();
              }
            }}
          >
            Add vehicle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <MemberPicker label="Owner" value={owner} onPick={setOwner} />
        {tried && !owner ? <p className="text-meta text-negative">Pick the owner first.</p> : null}
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <TextField label="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} optionalLabel />
          <TextField label="Make" value={make} onChange={(e) => setMake(e.target.value)} error={tried && !make.trim() ? "Add the make" : undefined} autoComplete="off" />
        </div>
        <TextField label="Model" value={model} onChange={(e) => setModel(e.target.value)} error={tried && !model.trim() ? "Add the model" : undefined} autoComplete="off" />
        <TextField label="Plate" value={plate} onChange={(e) => setPlate(e.target.value)} hint="Optional. Only your staff see it. It is never put in a text." optionalLabel autoComplete="off" />
        <TextField label="Odometer now (km)" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} optionalLabel />
        <Select label="How it is used" value={use} onChange={(e) => setUse(e.target.value)} options={[{ value: "personal", label: "Personal" }, { value: "rideshare", label: "Ride-hail or delivery (shorter service intervals)" }]} />
      </div>
    </SidePanel>
  );
}

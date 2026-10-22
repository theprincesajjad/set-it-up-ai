"use client";
import { BackLink, PageHeader, Panel } from "@/components/dashboard/kit";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { fromLocalInput } from "@/lib/dashboard/time";
import { useAction } from "@/lib/dashboard/useApi";

const DETAIL_FIELDS: Record<string, [string, string][]> = {
  device: [["make", "Make"], ["model", "Model"], ["imei", "IMEI / serial"]],
  vehicle: [["make", "Make"], ["model", "Model"], ["plate", "Plate"], ["mileage", "Mileage"]],
  garment: [["description", "Item"], ["colour", "Colour"], ["size", "Size"]],
  other: [["description", "Item"]],
};

export default function NewTicketPage() {
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <Intake />
    </FeatureGate>
  );
}

function Intake() {
  const { api, base, detail } = useMerchant();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"device" | "vehicle" | "garment" | "other">(detail.merchant.vertical === "repair_auto" ? "vehicle" : detail.merchant.vertical === "alterations" ? "garment" : "device");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState("");
  const [notes, setNotes] = useState("");
  const [promised, setPromised] = useState("");
  const act = useAction();
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <BackLink href={`${base}/tickets`}>Tickets</BackLink>
      <PageHeader title="Check in a repair" />
      <Panel>
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!phone) return act.setError("Enter the customer's mobile number.");
          if (!issue.trim()) return act.setError("Describe the problem.");
          const r = await act.run(() => api.createTicket({ customer: { phone, name: name.trim() || null }, locationId: detail.locations[0]?.id, itemKind: kind, itemDetails: Object.fromEntries(Object.entries(details).filter(([, v]) => v.trim())), issue: issue.trim(), intakeNotes: notes.trim() || null, promisedAt: promised ? fromLocalInput(promised) : null }));
          if (r) router.push(`${base}/tickets/${r.ticket.id}`);
        }}>
          <PhoneField label="Customer's mobile" onChangeE164={setPhone} hint="They get status texts and the quote link here." />
          <TextField label="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="What is it?" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={[{ value: "device", label: "Phone or device" }, { value: "vehicle", label: "Vehicle" }, { value: "garment", label: "Garment" }, { value: "other", label: "Something else" }]} />
          <div className="grid gap-4 sm:grid-cols-2">
            {DETAIL_FIELDS[kind]!.map(([k, l]) => <TextField key={k} label={l} optionalLabel value={details[k] ?? ""} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />)}
          </div>
          <TextField type="textarea" label="What's wrong" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Cracked screen, touch works" />
          <TextField type="textarea" label="Internal notes" optionalLabel hint="Only staff see these." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <TextField type="datetime-local" label="Promised by" optionalLabel value={promised} onChange={(e) => setPromised(e.target.value)} />
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <Button type="submit" loading={act.busy} className="self-start">Check in</Button>
        </form>
      </Panel>
    </div>
  );
}

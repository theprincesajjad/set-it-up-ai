"use client";
import { Camera, Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { INTAKE_CHECKLISTS } from "@ll/shared";
import { BackLink, PageHeader, Panel, SkeletonRows } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import { fromLocalInput } from "@/lib/dashboard/time";
import { MAX_PHOTO_BYTES, shrinkPhoto } from "@/lib/dashboard/photos";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const DETAIL_FIELDS: Record<string, [string, string][]> = {
  device: [["make", "Make"], ["model", "Model"], ["imei", "IMEI / serial"]],
  vehicle: [["year", "Year"], ["make", "Make"], ["model", "Model"], ["plate", "Plate"], ["mileage", "Odometer (km)"]],
  garment: [["colour", "Colour"], ["size", "Size"]],
  other: [["description", "Item"]],
};
const KIND_LABEL: Record<string, string> = { device: "Phone or device", vehicle: "Vehicle", garment: "Garment", other: "Something else" };
const TILES = ["Front", "Back", "Detail"];
const MAX_PHOTOS = 6;

export default function NewTicketPage() {
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <Suspense fallback={<SkeletonRows rows={6} />}>
        <Intake />
      </Suspense>
    </FeatureGate>
  );
}

type Kind = "device" | "vehicle" | "garment" | "other";

function Intake() {
  const { api, base, detail, role } = useMerchant();
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  // From a vehicle page (docs/research/auto-care.md): the owner, the car and the last odometer reading are filled in.
  const vehicleId = search.get("vehicleId");
  const settings = useApi(() => api.serviceOps.settings(), [api]);
  const terms = settings.data?.intakeTerms?.trim() || null;
  const [phone, setPhone] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>(detail.merchant.vertical === "repair_auto" ? "vehicle" : detail.merchant.vertical === "alterations" || detail.merchant.vertical === "dry_cleaning" ? "garment" : "device");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState("");
  const [notes, setNotes] = useState("");
  const [promised, setPromised] = useState("");
  const [shelf, setShelf] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [items, setItems] = useState<{ description: string; tag: string }[]>([{ description: "", tag: "" }]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const act = useAction();

  // Check in from a drop-off booking: the customer and what they said they are bringing are already filled in.
  const booking = useApi(bookingId ? async () => (await api.bookings({ kind: "dropoff", from: new Date(Date.now() - 2 * 86_400_000).toISOString() })).items.find((b) => b.id === bookingId) ?? null : null, [api, bookingId]);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const b = booking.data;
    if (!b || prefilled) return;
    // Prefill once from the booking; the staff member can still change everything.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefilled(true);
    if (b.customerName) setName(b.customerName);
    if (b.notes) setIssue(b.notes);
  }, [booking.data, prefilled]);
  const vehicle = useApi(vehicleId ? () => api.auto.vehicle(vehicleId) : null, [api, vehicleId]);
  const [carFilled, setCarFilled] = useState(false);
  useEffect(() => {
    const v = vehicle.data;
    if (!v || carFilled) return;
    // Prefill once from the vehicle; the staff member can still change everything.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarFilled(true);
    setKind("vehicle");
    if (v.ownerName) setName(v.ownerName);
    if (v.ownerPhone) {
      setPhone(v.ownerPhone);
      setDigits(v.ownerPhone.replace(/\D/g, "").slice(-10));
    }
    setDetails({ ...(v.year ? { year: String(v.year) } : {}), make: v.make, model: v.model, ...(v.plate ? { plate: v.plate } : {}) });
  }, [vehicle.data, carFilled]);
  const bookingPhone = booking.data?.customerPhone ?? null;
  useEffect(() => {
    if (bookingPhone && !phone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhone(bookingPhone);
      setDigits(bookingPhone.replace(/\D/g, "").slice(-10));
    }
  }, [bookingPhone, phone]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    for (const f of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      setUploading((n) => n + 1);
      try {
        const blob = await shrinkPhoto(f);
        if (blob.size > MAX_PHOTO_BYTES) throw new Error("That photo is over 5 MB. Try a smaller one.");
        const r = await api.serviceOps.upload(blob);
        setPhotos((p) => [...p, r.url]);
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "That photo didn't upload. Try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const checklist = INTAKE_CHECKLISTS[kind] ?? [];
  const multi = kind === "garment";
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <BackLink href={`${base}/tickets`}>Tickets</BackLink>
      <PageHeader title="Check in a repair" description={booking.data ? `From a drop-off booking for ${booking.data.customerName ?? "a customer"}. Their details are filled in.` : "Photos and the condition checklist are your record of what came in."} actions={role !== "staff" ? <Button variant="ghost" size="sm" href={`${base}/tickets/settings`}>Terms and tips</Button> : undefined} />
      <Panel>
        <form
          className="flex flex-col gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!phone) return act.setError("Enter the customer's mobile number.");
            if (!issue.trim()) return act.setError("Describe the problem.");
            if (kind === "vehicle" && !/\d/.test(details.mileage ?? "")) return act.setError("Add the odometer reading. The Ontario guide asks for it on the estimate and again on the invoice.");
            if (terms && !accepted) return act.setError("The customer needs to accept the drop-off terms.");
            const list = multi ? items.filter((i) => i.description.trim()).map((i) => ({ description: i.description.trim(), ...(i.tag.trim() ? { tag: i.tag.trim() } : {}) })) : [];
            const r = await act.run(() =>
              api.createTicket({
                customer: { phone, name: name.trim() || null },
                locationId: detail.locations[0]?.id,
                itemKind: kind,
                itemDetails: { ...Object.fromEntries(Object.entries(details).filter(([, v]) => v.trim())), ...(kind === "vehicle" && vehicleId ? { vehicleId } : {}) },
                issue: issue.trim(),
                intakeNotes: notes.trim() || null,
                promisedAt: promised ? fromLocalInput(promised) : null,
                photos,
                intakeChecklist: checks,
                termsAccepted: !!terms && accepted,
                shelfLocation: shelf.trim() || null,
                ...(list.length ? { items: list } : {}),
                ...(bookingId ? { bookingId } : {}),
              }),
            );
            if (r) router.push(`${base}/tickets/${r.ticket.id}`);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <PhoneField label="Customer's mobile" value={digits} onChangeDigits={setDigits} onChangeE164={setPhone} hint="They get status texts and the quote link here." />
            <TextField label="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Select label="What is it?" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setChecks([]); }} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k]! }))} />
          {multi ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-meta-strong text-fg">Items</legend>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_96px_40px] items-end gap-2">
                  <TextField label={`Item ${i + 1}`} hideLabel placeholder="Navy trousers, hem 2 cm" value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <TextField label="Tag" hideLabel placeholder="Tag" value={it.tag} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} />
                  <Button variant="ghost" size="sm" aria-label={`Remove item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}><X aria-hidden className="size-4" /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" iconStart={Plus} className="self-start" onClick={() => setItems([...items, { description: "", tag: "" }])}>Add another item</Button>
            </fieldset>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {DETAIL_FIELDS[kind]!.map(([k, l]) => <TextField key={k} label={l} optionalLabel={!(kind === "vehicle" && k === "mileage")} required={kind === "vehicle" && k === "mileage"} hint={kind === "vehicle" && k === "mileage" && vehicle.data?.odometerKm ? `Last reading ${vehicle.data.odometerKm.toLocaleString("en-CA")} km` : undefined} inputMode={k === "mileage" || k === "year" ? "numeric" : undefined} value={details[k] ?? ""} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />)}
            {kind === "garment" || kind === "other" ? <TextField label="Shelf or rack" optionalLabel hint="Where you will put it, so it is easy to find." value={shelf} onChange={(e) => setShelf(e.target.value)} /> : null}
          </div>
          <TextField type="textarea" label="What's wrong" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Cracked screen, touch works" />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta-strong text-fg">Photos</legend>
            <p className="text-meta text-fg-muted">Take a few before you touch it: front, back and any damage. Up to {MAX_PHOTOS}.</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={p} className="relative size-[88px] overflow-hidden rounded-card bg-bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={`Intake photo ${i + 1}`} className="size-full object-cover" />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(photos.filter((x) => x !== p))} className="absolute end-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-bg/90 text-fg focus-visible:focus-ring"><X aria-hidden className="size-3.5" /></button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS
                ? Array.from({ length: Math.max(1, Math.min(MAX_PHOTOS - photos.length, Math.max(0, 3 - photos.length))) }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading > 0}
                      className={cn("flex size-[88px] flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line text-meta text-fg-muted hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-50")}
                    >
                      <Camera aria-hidden className="size-5" strokeWidth={1.5} />
                      {uploading > 0 && i === 0 ? "Uploading" : TILES[photos.length + i] ?? "Add"}
                    </button>
                  ))
                : null}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" aria-label="Add photos" tabIndex={-1} onChange={(e) => void addPhotos(e.target.files)} />
            {photoError ? <p role="alert" className="text-meta text-negative">{photoError}</p> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta-strong text-fg">Condition at drop-off</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Condition checklist">
              {checklist.map((c) => {
                const on = checks.includes(c);
                return (
                  <button key={c} type="button" role="checkbox" aria-checked={on} onClick={() => setChecks(on ? checks.filter((x) => x !== c) : [...checks, c])} className={cn("rounded-full border px-3 py-1.5 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>
                    {c}
                  </button>
                );
              })}
            </div>
            {kind === "device" ? <p className="text-meta text-fg-muted">We do not store passcodes. Ask the customer to unlock the device when they pick it up.</p> : null}
          </fieldset>

          <TextField type="textarea" label="Internal notes" optionalLabel hint="Only staff see these." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <TextField type="datetime-local" label="Promised by" optionalLabel value={promised} onChange={(e) => setPromised(e.target.value)} />
          {terms ? (
            <div className="rounded-card border border-line p-4">
              <p className="text-meta-strong text-fg">Drop-off terms</p>
              <p className="mt-1 whitespace-pre-line text-meta text-fg-muted">{terms}</p>
              <div className="mt-3"><Checkbox label="The customer has read these terms and accepts them" checked={accepted} onChange={setAccepted} /></div>
            </div>
          ) : null}
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <Button type="submit" loading={act.busy} disabled={uploading > 0} className="self-start">Check in</Button>
        </form>
      </Panel>
    </div>
  );
}

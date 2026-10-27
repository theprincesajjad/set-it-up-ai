"use client";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async, PageSkeleton } from "@/components/dashboard/PageStates";
import { ReportCardSheet } from "@/components/dashboard/pets/ReportCardSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { shortDate, vaccineLabel, vaccineTag, weeksLabel } from "@/lib/dashboard/pets";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function PetPage() {
  return (
    <FeatureGate keys={["pets.profiles"]} title="Pets">
      <Pet />
    </FeatureGate>
  );
}

const KINDS = ["rabies", "dhpp", "bordetella"] as const;

/** One pet (Figma frame 1): grooming cadence and the handling note on the left, vaccine proof on the right. */
function Pet() {
  const { petId } = useParams<{ petId: string }>();
  const { api, base, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.pets.get(petId), [api, petId]);
  const [card, setCard] = useState(false);
  const [vax, setVax] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const p = state.data;
  if (!p) return <Async state={state} skeleton={<PageSkeleton rows={2} />}>{() => null}</Async>;
  const shop = p.shop;
  const noteValue = note ?? shop.handlingNote ?? "";
  const kinds = [...KINDS, ...p.vaccines.filter((v) => !(KINDS as readonly string[]).includes(v.kind)).map((v) => v.kind)];
  const save = async (body: Parameters<typeof api.pets.saveShop>[1], ok: string) => {
    const r = await act.run(() => api.pets.saveShop(p.id, body));
    if (r) {
      toast({ message: ok, tone: "success" });
      await state.reload();
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        back={{ href: `${base}/pets`, label: "Pets" }}
        title={`${p.name}, with ${p.ownerName ?? "the owner"}`}
        description={[p.breed, p.species === "dog" ? null : p.species, `${p.sizeBand} size`, `${p.coat.replace("_", " ")} coat`].filter(Boolean).join(", ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={async () => { const r = await act.run(() => api.pets.reportCard(p.id, { kind: "groom", did: [], send: false })); if (r) { toast({ message: "Groom logged", tone: "success" }); await state.reload(); } }}>Log a groom</Button>
            {enabled("pets.report_cards") ? <Button size="sm" variant="secondary" onClick={() => setCard(true)}>Send report card</Button> : null}
            {enabled("booking.appointments") ? <Button size="sm" href={`${base}/calendar`}>Book groom</Button> : null}
          </div>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {p.siblings.length > 1 ? (
        <nav aria-label="This owner's pets" className="flex flex-wrap gap-2">
          {p.siblings.map((s) => (
            <Link key={s.id} href={`${base}/pets/${s.id}`} aria-current={s.id === p.id ? "page" : undefined} className={s.id === p.id ? "inline-flex h-9 items-center rounded-full border border-fg bg-fg px-3.5 text-meta-strong text-bg" : "inline-flex h-9 items-center rounded-full border border-line px-3.5 text-meta-strong text-fg hover:bg-bg-subtle"}>
              {s.name}{s.species === "cat" ? " (cat)" : ""}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section aria-label="Grooming" className="flex flex-col gap-5 rounded-card border border-line px-5 py-5">
          <h2 className="text-body-strong text-fg">Grooming</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-caption text-fg-muted">Every</p>
              <p className="text-headline text-fg">{weeksLabel(shop.groomEveryWeeks ?? shop.defaultWeeks)}</p>
              {shop.groomEveryWeeks === null ? <p className="text-caption text-fg-muted">from the coat</p> : null}
            </div>
            <div>
              <p className="text-caption text-fg-muted">Last groom</p>
              <p className="text-headline text-fg">{shop.lastGroomOn ? shortDate(shop.lastGroomOn) : "Not yet"}</p>
            </div>
            <div>
              <p className="text-caption text-fg-muted">Next due</p>
              <p className="text-headline text-fg">{shop.nextDueOn ? shortDate(shop.nextDueOn) : "After a groom"}</p>
            </div>
            <Select
              label="Cadence"
              value={String(shop.groomEveryWeeks ?? "")}
              onChange={(e) => void save({ groomEveryWeeks: e.target.value ? Number(e.target.value) : null }, "Cadence saved")}
              options={[{ value: "", label: `Default (${shop.defaultWeeks} weeks)` }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: weeksLabel(i + 1) })), { value: "16", label: "16 weeks" }, { value: "26", label: "26 weeks" }]}
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <TextField label="Handling note (only your team sees this)" type="textarea" maxLength={500} showCount value={noteValue} onChange={(e) => setNote(e.target.value)} hint="About the dog: nervous at the dryer, bites at nail trims. No door codes, keys or addresses." />
            <Button size="sm" variant="secondary" className="self-start" disabled={note === null || note === (shop.handlingNote ?? "")} loading={act.busy} onClick={async () => { await save({ handlingNote: noteValue }, "Note saved"); setNote(null); }}>Save note</Button>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-meta-strong text-fg">Recent visits</h3>
            {shop.recentVisits.length === 0 ? <p className="text-meta text-fg-muted">No visits logged here yet.</p> : null}
            <ul className="flex flex-col gap-1.5">
              {shop.recentVisits.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 text-meta">
                  <span className="text-fg">{shortDate(v.at.slice(0, 10))} · {v.kind === "groom" ? "Groom" : "Daycare day"}</span>
                  <span className="text-fg-muted">{v.sent ? "Report card sent" : v.mood ? "Report card logged" : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <div className="flex flex-col gap-5">
          <section aria-label="Vaccine proof" className="overflow-hidden rounded-card border border-line">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-body-strong text-fg">Vaccine proof</h2>
              <p className="text-meta text-fg-muted">Rabies is the law (Ontario Reg. 567). The rest is your policy.</p>
            </div>
            <ul className="divide-y divide-line">
              {kinds.map((k) => {
                const v = p.vaccines.find((x) => x.kind === k);
                const tag = v ? vaccineTag(v) : null;
                return (
                  <li key={k} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="text-body-strong text-fg">{vaccineLabel(k)}</p>
                      <p className="text-meta text-fg-muted">{v ? `${v.status === "expired" ? "Expired" : "Expires"} ${shortDate(v.expiresOn)}, ${v.expiresOn.slice(0, 4)}` : "Not on file"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {tag ? <Dot tone={tag.tone}>{tag.label}</Dot> : <Dot tone="neutral">Missing</Dot>}
                      {v?.proofUrl ? <a href={v.proofUrl} target="_blank" rel="noreferrer" className="text-meta text-fg underline">View proof</a> : null}
                      <Button size="sm" variant="secondary" onClick={() => setVax(k)}>{v ? "Update" : "Add"}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="rounded-card bg-bg-subtle px-5 py-4">
            <p className="text-meta-strong text-fg">What we do not keep</p>
            <p className="mt-1 text-meta text-fg-muted">No vet records, diagnoses, medication lists, microchip numbers, door codes or house keys. A photo of the certificate and its date are enough.</p>
          </div>
          <section aria-label="Temperament check" className="flex items-center justify-between gap-4 rounded-card border border-line px-5 py-4">
            <div>
              <p className="text-body-strong text-fg">Daycare temperament check</p>
              <p className="text-meta text-fg-muted">{shop.assessment === "passed" ? `Passed ${shop.assessedAt ? shortDate(shop.assessedAt.slice(0, 10)) : ""}` : shop.assessment === "declined" ? "Not suitable for group play" : "Not tested yet"}</p>
            </div>
            <Select label="Temperament check" hideLabel value={shop.assessment} onChange={(e) => void save({ assessment: e.target.value as "none" | "passed" | "declined" }, "Saved")} options={[{ value: "none", label: "Not tested" }, { value: "passed", label: "Passed" }, { value: "declined", label: "Not suitable" }]} className="min-w-40" />
          </section>
        </div>
      </div>
      {enabled("pets.report_cards") ? <ReportCardSheet open={card} onClose={() => setCard(false)} petId={p.id} petName={p.name} ownerName={p.ownerName} onSent={() => void state.reload()} /> : null}
      <VaccineSheet kind={vax} onClose={() => setVax(null)} petId={p.id} current={p.vaccines.find((v) => v.kind === vax) ?? null} onSaved={() => void state.reload()} />
    </div>
  );
}

function VaccineSheet({ kind, onClose, petId, current, onSaved }: { kind: string | null; onClose: () => void; petId: string; current: { expiresOn: string; proofUrl: string | null } | null; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null | undefined>(undefined);
  const [busyUp, setBusyUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = date ?? current?.expiresOn ?? "";
  const close = () => { setDate(null); setProof(undefined); setErr(null); onClose(); };
  return (
    <SidePanel
      open={!!kind}
      onClose={close}
      label={`${vaccineLabel(kind ?? "")} certificate`}
      title={`${vaccineLabel(kind ?? "")} certificate`}
      subtitle="The expiry date on the certificate, and a photo of it."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            loading={act.busy}
            disabled={!value}
            onClick={async () => {
              const r = await act.run(() => api.pets.saveVaccine(petId, kind!, { expiresOn: value, ...(proof !== undefined ? { proofUrl: proof } : {}) }));
              if (r) {
                toast({ message: `${vaccineLabel(kind!)} saved`, tone: "success" });
                onSaved();
                close();
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
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <TextField label="Expiry date" type="date" value={value} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-center gap-3">
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            aria-label="Certificate photo"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusyUp(true);
              setErr(null);
              try {
                setProof((await api.pets.uploadPhoto(f)).url);
              } catch (x) {
                setErr(x instanceof Error ? x.message : "The photo did not upload.");
              } finally {
                setBusyUp(false);
              }
            }}
          />
          <Button variant="secondary" size="sm" iconStart={ImagePlus} loading={busyUp} onClick={() => file.current?.click()}>{proof || current?.proofUrl ? "Replace photo" : "Add a photo"}</Button>
          <p className="text-meta text-fg-muted">{proof ? "Photo ready. Save to keep it." : current?.proofUrl ? "A photo is on file." : "A photo of the paper certificate."}</p>
        </div>
        {!current && !value ? <Empty>Add the date to save.</Empty> : null}
      </div>
    </SidePanel>
  );
}

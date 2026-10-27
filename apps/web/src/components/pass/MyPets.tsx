"use client";
/**
 * /me/pets (docs/research/pet-care.md, Figma M1): the owner's pets, the vaccines on file with their expiry and a photo of each
 * certificate, and the next groom a shop expects. The owner keeps the proof current from home. We keep a date and a photo, nothing else.
 */
import { useEffect, useRef, useState } from "react";
import { COATS, PET_SPECIES, SIZE_BANDS, VACCINE_KINDS, type petApi } from "@ll/shared";
import { Heading, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

type Data = { items: petApi.PetDto[]; nextGroom: Record<string, { shop: string; on: string }> };
const SHOWN = ["rabies", "dhpp", "bordetella"] as const;

export function MyPets() {
  const { t, date } = useFmt();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = () => browserApi.me.myPets().then(setData).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);
  const thisYear = String(new Date().getFullYear());
  const day = (ymd: string) => date(ymd, ymd.startsWith(thisYear) ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, "UTC");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Heading plain>{t("pet.my.title")}</Heading>
        <p className="text-body text-fg-muted">{t("pet.my.sub")}</p>
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {data && data.items.length === 0 && !adding ? <p className="text-body text-fg-muted">{t("pet.my.none")}</p> : null}
      <ul className="flex flex-col gap-4">
        {(data?.items ?? []).map((p) => (
          <PetCard key={p.id} pet={p} next={data!.nextGroom[p.id]} day={day} onChanged={load} onError={setError} />
        ))}
      </ul>
      {adding ? (
        <AddPet
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="secondary" size="lg" fullWidth onClick={() => setAdding(true)}>{t("pet.add")}</Button>
      )}
      <p className="text-meta text-fg-muted">{t("pet.vax.note")}</p>
    </div>
  );
}

function PetCard({ pet, next, day, onChanged, onError }: { pet: petApi.PetDto; next?: { shop: string; on: string }; day: (ymd: string) => string; onChanged: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const { t } = useFmt();
  const [open, setOpen] = useState<string | null>(null);
  const kinds = [...SHOWN, ...pet.vaccines.filter((v) => !(SHOWN as readonly string[]).includes(v.kind)).map((v) => v.kind)];
  return (
    <li className="flex flex-col gap-3.5 rounded-card border border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-bg-muted text-headline font-semibold text-fg">{pet.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="text-headline text-fg"><bdi>{pet.name}</bdi></p>
          <p className="text-meta text-fg-muted">{[pet.breed, t(`pet.size.${pet.sizeBand}` as never)].filter(Boolean).join(", ")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (!window.confirm(`${t("pet.remove")}: ${pet.name}?`)) return;
            await browserApi.me.removePet(pet.id).catch((e) => onError(errorMessage(e)));
            await onChanged();
          }}
        >
          {t("pet.remove")}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {kinds.map((k) => {
          const v = pet.vaccines.find((x) => x.kind === k);
          return (
            <li key={k} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-strong text-fg">{t(`pet.vax.${k}` as never)}</p>
                  <p className="text-meta text-fg-muted">{v ? t("pet.vax.expiresOn", { date: day(v.expiresOn) }) : "—"}{v?.proofUrl ? ` · ${t("pet.vax.onFile")}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {v ? (
                    <span className={cn("inline-flex items-center gap-1.5 text-meta", v.status === "expired" ? "text-negative" : v.status === "expiring" ? "text-accent-text" : "text-fg")}>
                      <span aria-hidden className={cn("size-1.5 rounded-full", v.status === "expired" ? "bg-negative" : v.status === "expiring" ? "bg-accent" : "bg-positive")} />
                      {v.status === "expired" ? t("pet.vax.expired") : v.status === "expiring" ? t("pet.vax.expiring", { n: v.daysLeft }) : t("pet.vax.current")}
                    </span>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} aria-label={`${t(`pet.vax.${k}` as never)}: ${t("pet.vax.add")}`}>{v ? t("pet.vax.update") : t("pet.vax.addShort")}</Button>
                </div>
              </div>
              {open === k ? (
                <CertForm
                  petId={pet.id}
                  kind={k}
                  current={v?.expiresOn ?? ""}
                  onSaved={async () => {
                    setOpen(null);
                    await onChanged();
                  }}
                  onError={onError}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {next ? (
        <div className="rounded-card bg-bg-subtle px-3.5 py-3 text-meta text-fg">{t("pet.nextGroom", { shop: next.shop, date: day(next.on) })}</div>
      ) : null}
    </li>
  );
}

function CertForm({ petId, kind, current, onSaved, onError }: { petId: string; kind: string; current: string; onSaved: () => Promise<unknown>; onError: (m: string | null) => void }) {
  const { t } = useFmt();
  const file = useRef<HTMLInputElement>(null);
  const [d, setD] = useState(current);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 rounded-card bg-bg-subtle px-3.5 py-3.5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (!d) return;
        setBusy(true);
        onError(null);
        try {
          const f = file.current?.files?.[0];
          const proofUrl = f ? (await browserApi.me.uploadPetProof(f)).url : undefined;
          await browserApi.me.saveMyVaccine(petId, kind, { expiresOn: d, ...(proofUrl ? { proofUrl } : {}) });
          await onSaved();
        } catch (err) {
          onError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <TextField label={t("pet.vax.date")} type="date" value={d} onChange={(e) => setD(e.target.value)} error={tried && !d ? t("pet.vax.date") : undefined} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`proof-${petId}-${kind}`} className="text-meta-strong text-fg">{t("pet.vax.proof")}</label>
        <input id={`proof-${petId}-${kind}`} ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="text-meta text-fg" />
      </div>
      <Button type="submit" loading={busy} className="self-start">{t("pet.save")}</Button>
    </form>
  );
}

function AddPet({ onDone, onCancel }: { onDone: () => Promise<unknown>; onCancel: () => void }) {
  const { t } = useFmt();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("medium");
  const [coat, setCoat] = useState("short");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-dashed border-line px-4 py-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
          await browserApi.me.addPet({ name: name.trim(), species: species as "dog", breed: breed.trim() || null, sizeBand: size as "small", coat: coat as "short" });
          await onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-body-strong text-fg">{t("pet.add")}</h2>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label={t("pet.name")} value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? t("pet.name") : undefined} autoComplete="off" />
      <Select label={t("pet.species")} value={species} onChange={(e) => setSpecies(e.target.value)} options={PET_SPECIES.map((s) => ({ value: s, label: t(`pet.species.${s}` as never) }))} />
      <TextField label={t("pet.breed")} value={breed} onChange={(e) => setBreed(e.target.value)} autoComplete="off" />
      <Select label={t("pet.size")} value={size} onChange={(e) => setSize(e.target.value)} options={SIZE_BANDS.map((s) => ({ value: s, label: t(`pet.size.${s}` as never) }))} />
      <Select label={t("pet.coat")} value={coat} onChange={(e) => setCoat(e.target.value)} options={COATS.map((c) => ({ value: c, label: t(`pet.coat.${c}` as never) }))} />
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>{t("pet.save")}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t("pet.back")}</Button>
      </div>
    </form>
  );
}
void VACCINE_KINDS;

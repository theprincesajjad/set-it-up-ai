"use client";
import { useState } from "react";
import { LOCALES, type commerceApi } from "@ll/shared";
import { Sheet } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { COMMON_ALLERGENS, SPICE_LABELS, STATION_PRESETS, SpiceDots, stationLabel, type Dietary } from "@/components/dashboard/restaurant/menu";
import { FormGrid, GroupLabel, NumberField, ToggleChips } from "@/components/dashboard/restaurant/common";
import { TierTeaser } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction } from "@/lib/dashboard/useApi";

type Item = commerceApi.CatalogItemDto;
const LANGS = ["hi", "ur", "pa"] as const;
type Lang = (typeof LANGS)[number];
type Tr = Record<Lang, { name: string; description: string }>;

const DIET_OPTIONS = [
  { value: "halal", label: "Halal" },
  { value: "zabihah", label: "Zabihah" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
  { value: "glutenFree", label: "Gluten-free" },
] as const;
type DietKey = (typeof DIET_OPTIONS)[number]["value"];

function initialTr(item: Item): Tr {
  const get = (l: Lang) => ({ name: item.translations?.[l]?.name ?? "", description: item.translations?.[l]?.description ?? "" });
  return { hi: get("hi"), ur: get("ur"), pa: get("pa") };
}

/** Right-side sheet for one item's restaurant fields: dietary, translations, pre-order, station. */
export function ItemSheet({ item, onClose, onSaved, stations, shopCertifier = null }: { item: Item | null; onClose: () => void; onSaved: () => void; stations: string[]; /** The shop-level certifier: a dish only names its own when it is someone else. */ shopCertifier?: string | null }) {
  // Remount per item so the form starts from that item's values.
  return item ? <Form key={item.id} item={item} onClose={onClose} onSaved={onSaved} stations={stations} shopCertifier={shopCertifier} /> : null;
}

function Form({ item, onClose, onSaved, stations, shopCertifier }: { item: Item; onClose: () => void; onSaved: () => void; stations: string[]; shopCertifier: string | null }) {
  const { api, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const d = item.dietary ?? {};
  const [flags, setFlags] = useState<DietKey[]>(DIET_OPTIONS.map((o) => o.value).filter((k) => d[k]));
  const [certifier, setCertifier] = useState(d.halalCertifier ?? "");
  const [spice, setSpice] = useState<0 | 1 | 2 | 3>(d.spice ?? 0);
  const [allergens, setAllergens] = useState<string[]>(() => (d.allergens ?? []).map((a) => COMMON_ALLERGENS.find((c) => c.toLowerCase() === a.toLowerCase()) ?? a));
  const [customAllergen, setCustomAllergen] = useState("");
  const [tr, setTr] = useState<Tr>(() => initialTr(item));
  const [preorderOnly, setPreorderOnly] = useState(item.preorderOnly ?? false);
  const [lead, setLead] = useState(String(item.leadTimeHours ?? 0));
  const [serves, setServes] = useState(item.serves ? String(item.serves) : "");
  const [deposit, setDeposit] = useState(String(Math.round((item.depositBps ?? 0) / 100)));
  const [station, setStation] = useState(item.station ?? "");

  const dietOn = enabled("restaurant.dietary_tags");
  const langOn = enabled("restaurant.multilingual_menu");
  const preOn = enabled("restaurant.degh_preorders");
  const kdsOn = enabled("restaurant.kds");
  const halalish = flags.includes("halal") || flags.includes("zabihah");
  const allergenOptions = [...COMMON_ALLERGENS, ...allergens.filter((a) => !(COMMON_ALLERGENS as readonly string[]).includes(a))];

  async function save() {
    const body: commerceApi.UpdateCatalogItemBody = {};
    if (dietOn) {
      const dietary: Dietary = {};
      for (const k of flags) dietary[k] = true;
      dietary.spice = spice;
      if (allergens.length) dietary.allergens = allergens;
      if (halalish && certifier.trim()) dietary.halalCertifier = certifier.trim();
      body.dietary = dietary;
    }
    if (langOn) {
      const translations: NonNullable<commerceApi.UpdateCatalogItemBody["translations"]> = {};
      for (const l of LANGS) {
        const name = tr[l].name.trim();
        const description = tr[l].description.trim();
        if (name || description) translations[l] = { ...(name ? { name } : {}), ...(description ? { description } : {}) };
      }
      body.translations = translations;
    }
    if (preOn) {
      body.preorderOnly = preorderOnly;
      body.leadTimeHours = Math.min(720, Number(lead) || 0);
      body.serves = serves ? Number(serves) : null;
      body.depositBps = Math.min(100, Number(deposit) || 0) * 100;
    }
    if (kdsOn) body.station = station.trim() ? station.trim().toLowerCase() : null;
    const r = await act.run(() => api.updateItem(item.id, body));
    if (r) {
      toast({ message: `Saved ${item.name}`, tone: "success" });
      onSaved();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      subtitle={formatMoney(item.priceCents)}
      label="Edit item"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={act.busy} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
    <div className="flex flex-col gap-7 pb-2">
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      {dietOn ? (
        <section aria-label="Dietary" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <GroupLabel>Dietary tags</GroupLabel>
            <ToggleChips label="Dietary tags" options={DIET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={flags} onChange={(v) => setFlags(normaliseFlags(v, flags))} />
          </div>
          {halalish ? (
            <TextField
              label={shopCertifier ? "Different certifier for this dish" : "Halal certifier"}
              optionalLabel
              value={certifier}
              maxLength={120}
              onChange={(e) => setCertifier(e.target.value)}
              placeholder={shopCertifier ? "Leave empty to use your shop certificate" : "e.g. HMA, ISNA"}
              hint={shopCertifier ? `Only if this dish is certified by someone other than ${shopCertifier}. Shown to customers as you give it.` : "Shown to customers as you give it. We don't check or vouch for halal claims. Add your shop certificate above to say it once."}
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <GroupLabel>Spice</GroupLabel>
            <div role="radiogroup" aria-label="Spice level" className="grid grid-cols-4 gap-1.5">
              {([0, 1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={spice === n}
                  onClick={() => setSpice(n)}
                  className={cn("flex h-14 flex-col items-center justify-center gap-1.5 rounded-input border text-caption transition-colors focus-visible:focus-ring", spice === n ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
                >
                  <span className="inline-flex gap-0.5">
                    {n === 0 ? <span aria-hidden className="h-px w-3 bg-current" /> : <InvertibleDots level={n} on={spice === n} />}
                  </span>
                  {SPICE_LABELS[n]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <GroupLabel>Allergens</GroupLabel>
            <ToggleChips label="Allergens" options={allergenOptions.map((a) => ({ value: a, label: a }))} value={allergens} onChange={setAllergens} />
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const a = customAllergen.trim();
                if (a && !allergens.some((x) => x.toLowerCase() === a.toLowerCase())) setAllergens([...allergens, a.slice(0, 40)]);
                setCustomAllergen("");
              }}
            >
              <div className="min-w-0 flex-1">
                <TextField label="Another allergen" hideLabel placeholder="Another allergen, e.g. Coconut" value={customAllergen} maxLength={40} onChange={(e) => setCustomAllergen(e.target.value)} />
              </div>
              <Button type="submit" variant="secondary" size="md">
                Add
              </Button>
            </form>
          </div>
        </section>
      ) : null}

      {langOn ? (
        <section aria-label="Translations" className="flex flex-col gap-4 border-t border-line pt-6">
          <div>
            <GroupLabel>Translations</GroupLabel>
            <p className="text-meta text-fg-muted">Customers who pick a language see these. Anything left empty shows your English text.</p>
          </div>
          {LANGS.map((l) => {
            const info = LOCALES[l];
            const field = "text-start";
            return (
              <fieldset key={l} className="flex flex-col gap-2 rounded-card bg-card shadow-card p-3">
                <legend className="px-1 text-meta-strong text-fg">
                  {info.englishName} <span lang={info.bcp47} className="text-fg-muted">({info.name})</span>
                </legend>
                <TextField
                  label={`Name in ${info.englishName}`}
                  hideLabel
                  placeholder={`Name in ${info.englishName}`}
                  value={tr[l].name}
                  maxLength={120}
                  lang={info.bcp47}
                  dir={info.dir}
                  className={field}
                  onChange={(e) => setTr({ ...tr, [l]: { ...tr[l], name: e.target.value } })}
                />
                <TextField
                  type="textarea"
                  label={`Description in ${info.englishName}`}
                  hideLabel
                  placeholder={`Description in ${info.englishName}`}
                  value={tr[l].description}
                  maxLength={1000}
                  lang={info.bcp47}
                  dir={info.dir}
                  className={cn(field, "min-h-20", l === "ur" && "leading-loose")}
                  onChange={(e) => setTr({ ...tr, [l]: { ...tr[l], description: e.target.value } })}
                />
              </fieldset>
            );
          })}
        </section>
      ) : null}

      <section aria-label="Pre-order" className="flex flex-col gap-4 border-t border-line pt-6">
        <GroupLabel>Pre-order</GroupLabel>
        {preOn ? (
          <>
            <Switch label="Pre-order only" description="Customers book this ahead, like a pot of biryani for Friday. It can't be bought for right now." checked={preorderOnly} onChange={setPreorderOnly} />
            <FormGrid cols={3}>
              <NumberField label="Lead time" suffix="hours" value={lead} onChange={setLead} hint="Notice you need" />
              <NumberField label="Serves" value={serves} onChange={setServes} hint="People per pot" />
              <NumberField label="Deposit" suffix="%" value={deposit} onChange={setDeposit} hint="Charged when booked" />
            </FormGrid>
          </>
        ) : (
          <TierTeaser featureKey="restaurant.degh_preorders" inline />
        )}
      </section>

      <section aria-label="Kitchen station" className="flex flex-col gap-3 border-t border-line pt-6">
        <GroupLabel>Kitchen station</GroupLabel>
        {kdsOn ? (
          <>
            <TextField label="Station" hideLabel placeholder="e.g. tandoor" list="stations" value={station} maxLength={40} onChange={(e) => setStation(e.target.value)} hint="Tickets for this item show up on this station's screen." />
            <datalist id="stations">
              {[...new Set([...STATION_PRESETS, ...stations])].map((s) => (
                <option key={s} value={s}>
                  {stationLabel(s)}
                </option>
              ))}
            </datalist>
          </>
        ) : (
          <TierTeaser featureKey="restaurant.kds" inline />
        )}
      </section>

    </div>
    </Sheet>
  );
}

/** Zabihah is halal; vegan is vegetarian: turning the first on turns the second on (the API does the same). */
function normaliseFlags(next: DietKey[], prev: DietKey[]): DietKey[] {
  const out = new Set(next);
  if (out.has("zabihah") && !prev.includes("zabihah")) out.add("halal");
  if (out.has("vegan") && !prev.includes("vegan")) out.add("vegetarian");
  if (!out.has("halal")) out.delete("zabihah");
  if (!out.has("vegetarian")) out.delete("vegan");
  return DIET_OPTIONS.map((o) => o.value).filter((k) => out.has(k));
}

function InvertibleDots({ level, on }: { level: number; on: boolean }) {
  if (!on) return <SpiceDots level={level} />;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cn("size-1.5 rounded-full", n <= level ? "bg-bg" : "bg-bg/30")} />
      ))}
    </span>
  );
}

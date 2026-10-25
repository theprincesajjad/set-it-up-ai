"use client";
import { useState } from "react";
import { LOCALES, type commerceApi } from "@ll/shared";
import { Section } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

type Category = commerceApi.CatalogCategoryDto;
const LANGS = ["hi", "ur", "pa"] as const;

/** Section (tab) names in Hindi, Urdu and Punjabi. Empty fields show the English name. */
export function CategoryNames({ categories, onSaved }: { categories: Category[]; onSaved: () => void }) {
  if (!categories.length) return null;
  return (
    <Section title="Section names" description="Customers who pick a language see these tab names. Anything left empty shows the English name.">
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {categories.map((c) => (
          <Row key={c.id} cat={c} onSaved={onSaved} />
        ))}
      </ul>
    </Section>
  );
}

function Row({ cat, onSaved }: { cat: Category; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [vals, setVals] = useState<Record<(typeof LANGS)[number], string>>({ hi: cat.translations?.hi?.name ?? "", ur: cat.translations?.ur?.name ?? "", pa: cat.translations?.pa?.name ?? "" });
  const dirty = LANGS.some((l) => vals[l].trim() !== (cat.translations?.[l]?.name ?? ""));
  async function save() {
    const translations: Record<string, { name: string }> = {};
    for (const l of LANGS) if (vals[l].trim()) translations[l] = { name: vals[l].trim() };
    const r = await act.run(() => api.updateCategory(cat.id, { translations }));
    if (r) {
      toast({ message: `Saved ${cat.name}`, tone: "success" });
      onSaved();
    }
  }
  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="text-meta-strong text-fg">{cat.name}</p>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {LANGS.map((l) => {
          const info = LOCALES[l];
          return (
            <TextField
              key={l}
              label={`${cat.name} in ${info.englishName}`}
              hideLabel
              placeholder={`Name in ${info.englishName}`}
              value={vals[l]}
              maxLength={120}
              lang={info.bcp47}
              dir={info.dir}
              className="text-start"
              onChange={(e) => setVals({ ...vals, [l]: e.target.value })}
            />
          );
        })}
      </div>
      <Button size="sm" variant="secondary" className="self-start" disabled={!dirty} loading={act.busy} onClick={save}>
        Save names
      </Button>
    </li>
  );
}

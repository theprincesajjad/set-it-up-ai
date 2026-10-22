"use client";
import { useEffect, useState } from "react";
import { LOCALES, type restaurantApi } from "@ll/shared";
import { PageHeader, Panel, SaveBar } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Loader } from "@/components/dashboard/restaurant/common";
import { RestaurantGate } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Lang = restaurantApi.MenuLang;
const ORDER: Lang[] = ["en", "hi", "ur", "pa"];
const BLURB: Record<Lang, string> = {
  en: "Always on. Your own wording is what shows when a translation is missing.",
  hi: "For customers who read Devanagari.",
  ur: "Reads right to left. Customers see it that way too.",
  pa: "For customers who read Gurmukhi.",
};

export default function MenuLanguagesPage() {
  return (
    <RestaurantGate featureKey="restaurant.multilingual_menu" title="Menu languages">
      <Languages />
    </RestaurantGate>
  );
}

function Languages() {
  const { api, base, role } = useMerchant();
  const state = useApi(() => api.menuSettings.languages(), [api]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush back={{ href: `${base}/restaurant/menu`, label: "Dietary & languages" }} title="Menu languages" description="Pick the languages customers can switch to on your menu. Add the words for each dish on its item sheet." />
      <Loader state={state} rows={4} gate={{ featureKey: "restaurant.multilingual_menu", title: "Menu languages", what: "Show your menu in Hindi, Urdu and Punjabi." }}>
        {(d) => <Form saved={d.languages} canEdit={role === "owner" || role === "manager"} onSaved={(r) => state.setData(r)} />}
      </Loader>
    </div>
  );
}

function Form({ saved, canEdit, onSaved }: { saved: Lang[]; canEdit: boolean; onSaved: (r: restaurantApi.MenuLanguagesResponse) => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [on, setOn] = useState<Lang[]>(saved);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(saved);
  }, [saved]);
  const dirty = on.length !== saved.length || on.some((l) => !saved.includes(l));
  const save = async () => {
    const r = await act.run(() => api.menuSettings.saveLanguages(ORDER.filter((l) => on.includes(l))));
    if (r) {
      onSaved(r);
      toast({ message: "Menu languages saved", tone: "success" });
    }
  };
  return (
    <>
      {!canEdit ? <Banner tone="info">Only owners and managers can change the languages.</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Panel title="Languages on your menu" padded={false} className="max-w-[640px]">
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {ORDER.map((l) => {
            const info = LOCALES[l];
            return (
              <li key={l} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <Checkbox
                  label={
                    <span className="flex items-baseline gap-2">
                      {info.englishName}
                      <span lang={info.bcp47} dir={info.dir} className="text-meta text-fg-muted">
                        {info.name}
                      </span>
                    </span>
                  }
                  caption={BLURB[l]}
                  checked={on.includes(l)}
                  disabled={l === "en" || !canEdit}
                  onChange={(v) => setOn(v ? [...on, l] : on.filter((x) => x !== l))}
                />
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="max-w-[640px] text-meta text-fg-muted">Dishes without a translation show your English name and description in that language&apos;s view.</p>
      <SaveBar dirty={dirty && canEdit} error={act.error} onDiscard={() => setOn(saved)}>
        <Button size="sm" loading={act.busy} onClick={save}>
          Save languages
        </Button>
      </SaveBar>
    </>
  );
}

"use client";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/dashboard/kit";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { errorMessage } from "@/lib/api/errors";
import { categoriesVisible } from "@/lib/dashboard/program";

/** Categories that don't earn (merchant-dashboard.md §5.4). Regulated ones are locked with an explanation. */
export function CategoriesEditor({ categories, onChange }: { categories: merchantApi.Category[]; onChange: (c: merchantApi.Category[]) => void }) {
  const { api, detail, enabled } = useMerchant();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const pharmacy = detail.merchant.vertical === "pharmacy";
  // Compliance for pharmacy, grocery and retail (or a connected POS with synced categories). Cafés never see it; their stored categories stay.
  if (!categoriesVisible(detail.merchant.vertical, categories, enabled("integrations.pos_auto_award"))) return null;
  const replace = (c: merchantApi.Category) => onChange(categories.some((x) => x.id === c.id) ? categories.map((x) => (x.id === c.id ? c : x)) : [...categories, c]);
  const set = async (c: merchantApi.Category, body: Partial<merchantApi.Category>) => {
    setError(null);
    try {
      replace(await api.updateCategory(c.id, body));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Panel title="What each category earns" description="Switch off Earns points for anything that should not earn (gift cards, regulated items). Match these to your POS categories so the right items earn. Points never apply to regulated categories.">
      {pharmacy ? (
        <Banner tone="info" className="mt-3" title={copy.misc.pharmacyLockedTitle}>
          {copy.misc.pharmacyLockedBody}
        </Banner>
      ) : null}
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {categories.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-2 text-meta-strong text-fg">
                {c.protected ? <Lock aria-hidden className="size-3.5 text-fg-muted" strokeWidth={1.75} /> : null}
                {c.name}
                {c.protected && pharmacy ? <span className="whitespace-nowrap rounded-full bg-fg px-2 py-0.5 text-[11px] font-medium text-bg" data-testid="locked-tag" title="Locked by Ontario pharmacy rules">Locked</span> : null}
                {c.protected ? (
                  <button type="button" onClick={() => setWhy(why === c.id ? null : c.id)} aria-expanded={why === c.id} className="text-meta font-normal text-fg-muted underline underline-offset-4">
                    Why?
                  </button>
                ) : null}
              </p>
              <div className="sm:w-44">
                <Switch label="Earns points" checked={c.earnEligible} disabled={c.protected} onChange={(v) => set(c, { earnEligible: v })} />
              </div>
              <div className="sm:w-44">
                <Switch label="Discounts apply" checked={c.discountEligible} disabled={c.protected} onChange={(v) => set(c, { discountEligible: v })} />
              </div>
            </div>
            {why === c.id ? (
              <p className="mt-2 rounded-input bg-bg-subtle p-3 text-meta text-fg">
                {pharmacy
                  ? copy.misc.pharmacyLockedWhy
                  : "Ontario rules don't allow loyalty points or discounts as an inducement on prescriptions and pharmacy services, and points on tobacco, lottery and gift cards aren't allowed either. This category is always locked off, for every shop on the network."}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex items-start gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            replace(await api.createCategory({ name: name.trim() }));
            setName("");
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <TextField label="New category" hideLabel placeholder={pharmacy ? "New category, e.g. Vitamins" : "New category, e.g. Gift wrap"} value={name} onChange={(e) => setName(e.target.value)} hint={pharmacy ? copy.misc.pharmacyAddHint : undefined} />
        <Button type="submit" variant="secondary" iconStart={Plus}>
          Add
        </Button>
      </form>
      {pharmacy ? (
        <div className="mt-5 rounded-input bg-bg-subtle p-4" data-testid="pharmacy-also-blocked">
          <p className="text-meta-strong text-fg">Also blocked for this shop</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-meta text-fg-muted">
            {copy.misc.pharmacyAlsoBlocked.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

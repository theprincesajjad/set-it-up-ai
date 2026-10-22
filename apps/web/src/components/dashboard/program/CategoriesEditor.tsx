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

/** Categories that don't earn (merchant-dashboard.md §5.4). Regulated ones are locked with an explanation. */
export function CategoriesEditor({ categories, onChange }: { categories: merchantApi.Category[]; onChange: (c: merchantApi.Category[]) => void }) {
  const { api, detail } = useMerchant();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
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
    <Panel title="Categories that don't earn" description="Match these to your POS categories so the right items earn. Points never apply to regulated categories.">
      {detail.merchant.vertical === "pharmacy" ? <Banner tone="info" className="mt-3">{copy.misc.pharmacyRule}</Banner> : null}
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {categories.map((c) => (
          <li key={c.id} className="py-2.5">
            <div className="grid items-center gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto_auto]">
              <p className="flex items-center gap-2 text-meta-strong text-fg">
                {c.protected ? <Lock aria-hidden className="size-3.5 text-fg-muted" strokeWidth={1.75} /> : null}
                {c.name}
                {c.protected ? (
                  <button type="button" onClick={() => setWhy(why === c.id ? null : c.id)} aria-expanded={why === c.id} className="text-meta font-normal text-fg-muted underline underline-offset-4">
                    Why?
                  </button>
                ) : null}
              </p>
              <div className="sm:w-52">
                <Switch label="Earns points" checked={c.earnEligible} disabled={c.protected} onChange={(v) => set(c, { earnEligible: v })} />
              </div>
              <div className="sm:w-52">
                <Switch label="Discounts apply" checked={c.discountEligible} disabled={c.protected} onChange={(v) => set(c, { discountEligible: v })} />
              </div>
            </div>
            {why === c.id ? (
              <p className="mt-2 rounded-input bg-bg-subtle p-3 text-meta text-fg">
                Ontario rules don&apos;t allow loyalty points or discounts as an inducement on prescriptions and pharmacy services, and points on tobacco, lottery and gift cards aren&apos;t allowed either. This category is always locked off, for every shop on the network.
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
        <TextField label="New category" hideLabel placeholder="New category, e.g. Gift wrap" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" iconStart={Plus}>
          Add
        </Button>
      </form>
    </Panel>
  );
}

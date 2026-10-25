"use client";
import { Languages, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { Capsules, EmptyState, ErrorLine, PageHeader, Section, SkeletonRows, Tag } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { DietChips, STATION_PRESETS, rowCertifier, sharedCertifier, stationLabel } from "@/components/dashboard/restaurant/menu";
import { RestaurantGate } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { inputBase } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { CategoryNames } from "./CategoryNames";
import { DualPricing } from "./DualPricing";
import { HalalCertification } from "./HalalCertification";
import { ItemSheet } from "./ItemSheet";

type Item = commerceApi.CatalogItemDto;
const BOX = "size-4 cursor-pointer accent-[var(--ll-color-fg)]";
type Filter = "all" | "halal" | "veg" | "untagged";

const missingLangs = (i: Item, enabledLangs: string[] | null) => (enabledLangs ?? []).filter((l) => l !== "en" && !i.translations?.[l]?.name);

const matches = (i: Item, f: Filter) => {
  const d = i.dietary ?? {};
  if (f === "halal") return !!(d.halal || d.zabihah);
  if (f === "veg") return !!(d.vegetarian || d.vegan);
  if (f === "untagged") return !(d.halal || d.zabihah || d.vegetarian || d.vegan || d.jain || d.glutenFree || d.spice);
  return true;
};

export default function MenuPage() {
  return (
    <RestaurantGate featureKey="restaurant.dietary_tags" title="Dietary & languages">
      <Menu />
    </RestaurantGate>
  );
}

function Menu() {
  const { api, base, enabled, role } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.catalog(), [api]);
  // The shop-level halal certificate (owner only). Dishes name a certifier only when it differs from this one.
  const certState = useApi(role === "owner" ? () => api.halalCertification.get() : null, [api, role]);
  const dual = useApi(enabled("restaurant.dual_pricing") ? () => api.menuSettings.dualPricing() : null, [api]);
  const langs = useApi(enabled("restaurant.multilingual_menu") ? () => api.menuSettings.languages() : null, [api]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Item | null>(null);
  const [station, setStation] = useState("");
  const act = useAction();

  const items = useMemo(() => state.data?.items ?? [], [state.data]);
  const cashBps = dual.data?.cashDiscountBps ?? 0;
  const stations = useMemo(() => [...new Set(items.map((i) => i.station).filter((s): s is string => !!s))].sort(), [items]);
  const visible = items.filter((i) => matches(i, filter) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = useMemo(() => {
    const cats = [...(state.data?.categories ?? []), { id: "", name: "No section" }];
    return cats.map((c) => ({ cat: c, items: visible.filter((i) => (i.categoryId ?? "") === c.id) })).filter((g) => g.items.length);
  }, [state.data, visible]);
  const shopCertifier = certState.data?.halalCertification?.certifier ?? null;
  const certifier = useMemo(() => shopCertifier ?? sharedCertifier(items), [items, shopCertifier]);
  const sample = useMemo(() => {
    const prices = items.map((i) => i.priceCents).sort((a, b) => a - b);
    return prices[Math.floor(prices.length / 2)] ?? 2400;
  }, [items]);

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const allVisibleOn = visible.length > 0 && visible.every((i) => picked.has(i.id));
  const chosen = items.filter((i) => picked.has(i.id));

  async function bulk(label: string, run: (i: Item) => Promise<unknown>) {
    const r = await act.run(async () => {
      for (const i of chosen) await run(i);
      return true;
    });
    await state.reload();
    if (r) {
      toast({ message: `${label}: ${chosen.length} ${chosen.length === 1 ? "item" : "items"}`, tone: "success" });
      setPicked(new Set());
    }
  }

  const langList = langs.data?.languages ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Dietary & languages"
        description="Halal, vegetarian and spice tags, Hindi, Urdu and Punjabi names, and degh pre-order details for each dish."
        actions={
          <>
            <Button size="sm" variant="secondary" href={`${base}/catalog`}>
              Add or price items
            </Button>
            {enabled("restaurant.multilingual_menu") ? (
              <Button size="sm" iconStart={Languages} href={`${base}/restaurant/menu/languages`}>
                Languages
              </Button>
            ) : null}
          </>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {role === "owner" ? <HalalCertification state={certState} /> : <p className="text-meta text-fg-muted">The owner manages the halal certificate. Halal claims are the owner&apos;s own.</p>}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Search the menu</span>
              <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes" className={cn(inputBase, "h-10 ps-9")} />
            </label>
            <Capsules
              label="Filter by tag"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: items.length },
                { value: "halal", label: "Halal", count: items.filter((i) => matches(i, "halal")).length },
                { value: "veg", label: "Vegetarian", count: items.filter((i) => matches(i, "veg")).length },
                { value: "untagged", label: "Needs tags", count: items.filter((i) => matches(i, "untagged")).length },
              ]}
            />
          </div>

          {chosen.length ? (
            <div role="region" aria-label="Bulk actions" className="sticky top-2 z-raised flex flex-wrap items-center gap-2 rounded-card border border-line bg-bg px-4 py-2.5 shadow-float">
              <p className="me-auto text-meta-strong text-fg tabular" aria-live="polite">
                {chosen.length} selected
              </p>
              <Button size="sm" variant="secondary" loading={act.busy} onClick={() => bulk("Marked halal", (i) => api.updateItem(i.id, { dietary: { ...i.dietary, halal: true } }))}>
                Mark halal
              </Button>
              {enabled("restaurant.kds") ? (
                <>
                  <div className="w-36">
                    <Select
                      label="Station for selected items"
                      hideLabel
                      placeholder="Pick station"
                      value={station}
                      onChange={(e) => setStation(e.target.value)}
                      options={[...new Set([...STATION_PRESETS, ...stations])].map((s) => ({ value: s, label: stationLabel(s) }))}
                      className="h-9"
                    />
                  </div>
                  <Button size="sm" variant="secondary" disabled={!station} loading={act.busy} onClick={() => bulk(`Set to ${stationLabel(station)}`, (i) => api.updateItem(i.id, { station }))}>
                    Set station
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" iconStart={X} onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}

          {state.error && !state.data ? (
            <ErrorLine message={state.error} onRetry={() => void state.reload()} />
          ) : !state.data ? (
            <SkeletonRows rows={8} />
          ) : !items.length ? (
            <EmptyState title="No dishes yet" description="Add your menu first, then come back to tag it." action={<Button size="sm" href={`${base}/catalog`}>Add items</Button>} />
          ) : !groups.length ? (
            <p className="py-8 text-meta text-fg-muted">Nothing matches. Try another tag or search.</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line pb-2">
                <label className="flex min-h-9 cursor-pointer items-center gap-3 ps-3 text-meta text-fg-muted">
                  <input type="checkbox" checked={allVisibleOn} onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...visible.map((i) => i.id)]) : new Set([...picked].filter((id) => !visible.some((i) => i.id === id))))} className={BOX} />
                  Select all shown
                </label>
                <p className="text-meta text-fg-muted tabular">
                  {!shopCertifier && certifier ? `Halal items certified by ${certifier} · ` : ""}
                  {visible.length} dishes
                </p>
              </div>
              {groups.map(({ cat, items: rows }) => (
                <Section key={cat.id || "none"} title={cat.name} className="gap-0">
                  <ul className="divide-y divide-line border-y border-line">
                    {rows.map((i) => (
                      <li key={i.id} className={cn("flex items-center gap-3 py-2.5 ps-1", picked.has(i.id) && "bg-bg-subtle")}>
                        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                          <span className="sr-only">Select {i.name}</span>
                          <input type="checkbox" checked={picked.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} className={BOX} />
                        </label>
                        <button type="button" onClick={() => setEdit(i)} aria-label={`Edit ${i.name}`} className="grid min-w-0 flex-1 gap-x-4 gap-y-1 rounded-input px-2 py-1 text-start hover:bg-bg-subtle focus-visible:focus-ring md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                          <span className="min-w-0">
                            <span className="block text-body text-fg">{i.name}</span>
                            <span className="block text-meta text-fg-muted tabular">
                              {formatMoney(i.priceCents)}
                              {cashBps > 0 ? ` · cash ${formatMoney(Math.round(i.priceCents * (1 - cashBps / 10_000)))}` : ""}
                              {rowCertifier(i.dietary, certifier) ? ` · certified by ${rowCertifier(i.dietary, certifier)}` : ""}
                            </span>
                          </span>
                          <span className="flex min-w-0 flex-col gap-1 self-center md:items-end">
                            <DietChips dietary={i.dietary} className="md:justify-end" />
                            {i.preorderOnly || i.station || missingLangs(i, langList).length ? (
                              <span className="flex flex-wrap items-center gap-1.5 md:justify-end">
                                {i.preorderOnly ? <Tag>Pre-order{i.serves ? ` · serves ${i.serves}` : ""}</Tag> : null}
                                {i.station ? <Tag>{stationLabel(i.station)}</Tag> : null}
                                {missingLangs(i, langList).length ? <Tag>Missing {missingLangs(i, langList).join(", ")}</Tag> : null}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
              <p className="text-caption text-fg-muted">Halal and dietary tags are your own claims. A dish shows a certifier only when you name one that differs from your shop certificate.</p>
            </>
          )}
          {enabled("restaurant.multilingual_menu") ? <CategoryNames categories={state.data?.categories ?? []} onSaved={() => void state.reload()} /> : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          <DualPricing sampleCents={sample} />
          {langList ? (
            <p className="text-meta text-fg-muted">
              Menu shown in {langList.length} {langList.length === 1 ? "language" : "languages"}.{" "}
              <a className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg" href={`${base}/restaurant/menu/languages`}>
                Change languages
              </a>
            </p>
          ) : null}
        </aside>
      </div>

      <ItemSheet item={edit} onClose={() => setEdit(null)} onSaved={() => void state.reload()} stations={stations} shopCertifier={shopCertifier} />
    </div>
  );
}

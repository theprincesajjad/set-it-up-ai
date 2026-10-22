"use client";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { adsApi, type adsApi as A } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { PageHeader } from "@/components/ui/Layout";
import { PromoCard } from "@/components/ui/PromoCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { formatMoney } from "@/lib/format";
import { addDays, fromLocalInput, toLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";
import { PLACEMENT_LABEL } from "@/lib/dashboard/ads";

export default function NewAdPage() {
  return (
    <FeatureGate keys={["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"]} title="Sponsored placements">
      <NewAd />
    </FeatureGate>
  );
}

function NewAd() {
  const { api, base, detail, enabled } = useMerchant();
  const router = useRouter();
  const params = useSearchParams();
  const promos = useApi(() => api.promos("live"), [api]);
  const hoods = useNeighbourhoods();
  const placements = adsApi.AD_PLACEMENTS.filter((p) => enabled(adsApi.AD_PLACEMENT_FEATURE[p]));
  const [placement, setPlacement] = useState<A.AdPlacement>(params.get("promoId") && placements.includes("promo_boost") ? "promo_boost" : (placements[0] ?? "feed_top"));
  const card = adsApi.AD_RATE_CARD[placement];
  const [model, setModel] = useState<A.AdPricingModel>(card.dailyCents ? "daily" : "cpm");
  const [promoId, setPromoId] = useState(params.get("promoId") ?? "");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [nbhd, setNbhd] = useState<string[]>(detail.merchant.neighbourhoodId ? [detail.merchant.neighbourhoodId] : []);
  const [radius, setRadius] = useState("");
  const [start, setStart] = useState(toLocalInput(addDays(new Date().toISOString(), 1)));
  const [end, setEnd] = useState(toLocalInput(addDays(new Date().toISOString(), 8)));
  const [budget, setBudget] = useState("50");
  const act = useAction();
  const effModel = model === "daily" && !card.dailyCents ? "cpm" : model === "cpm" && !card.cpmCents ? "daily" : model;
  const days = Math.max(1, Math.ceil((new Date(fromLocalInput(end) ?? "").getTime() - new Date(fromLocalInput(start) ?? "").getTime()) / 86_400_000));
  const cost = effModel === "daily" ? (card.dailyCents ?? 0) * days : Math.round((Number.parseFloat(budget) || 0) * 100);
  const promo = promos.data?.items.find((p) => p.id === promoId);

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/ads`} className="self-start">Ads</Button>
      <PageHeader title="New ad" description="Pick where it shows. You pay the rate card; there's no bidding." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card padding="lg" className="flex flex-col gap-4">
          <Select label="Placement" value={placement} onChange={(e) => setPlacement(e.target.value as A.AdPlacement)} options={placements.map((p) => ({ value: p, label: `${PLACEMENT_LABEL[p]} · ${adsApi.AD_RATE_CARD[p].dailyCents ? `${formatMoney(adsApi.AD_RATE_CARD[p].dailyCents)}/day` : ""}${adsApi.AD_RATE_CARD[p].dailyCents && adsApi.AD_RATE_CARD[p].cpmCents ? " or " : ""}${adsApi.AD_RATE_CARD[p].cpmCents ? `${formatMoney(adsApi.AD_RATE_CARD[p].cpmCents)} per 1,000 views` : ""}` }))} />
          {card.dailyCents && card.cpmCents ? <SegmentedControl label="Pricing" value={effModel} onChange={setModel} options={[{ value: "daily", label: "Per day" }, { value: "cpm", label: "Per 1,000 views" }]} /> : null}
          {placement === "promo_boost" || placement === "nearby_push" ? <Select label="Promo to boost" placeholder="Pick a live promo" value={promoId} onChange={(e) => setPromoId(e.target.value)} options={(promos.data?.items ?? []).map((p) => ({ value: p.id, label: p.title }))} /> : null}
          <TextField label="Headline" optionalLabel={!!promoId} value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} showCount />
          <TextField type="textarea" label="Text" optionalLabel value={body} onChange={(e) => setBody(e.target.value)} maxLength={280} showCount />
          <fieldset>
            <legend className="mb-1 text-label text-fg">Neighbourhoods</legend>
            {(hoods ?? []).map((n) => <Checkbox key={n.id} label={n.name} checked={nbhd.includes(n.id)} onChange={(v) => setNbhd(v ? [...nbhd, n.id] : nbhd.filter((x) => x !== n.id))} />)}
          </fieldset>
          <TextField label="Or within" optionalLabel inputMode="numeric" suffix="m" hint="Measured from your locations (200 to 10,000 m)." value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ""))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField type="datetime-local" label="Starts" value={start} onChange={(e) => setStart(e.target.value)} />
            <TextField type="datetime-local" label="Ends" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          {effModel === "cpm" ? <TextField label="Budget" inputMode="decimal" prefix="$" hint={`Minimum ${formatMoney(adsApi.AD_RULES.minBudgetCents)}.`} value={budget} onChange={(e) => setBudget(e.target.value)} /> : null}
          <p className="rounded-md bg-surface-sunken px-4 py-3 text-body text-fg">Total: <strong className="tabular-nums">{formatMoney(cost)}</strong>{effModel === "daily" ? ` (${days} days × ${formatMoney(card.dailyCents)})` : ""}. You pay after you submit; it runs once approved.</p>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <Button className="self-start" loading={act.busy} onClick={async () => {
            const r = await act.run(() => api.createAd({ placement, pricingModel: effModel, promoId: promoId || undefined, headline: headline.trim() || undefined, body: body.trim() || undefined, neighbourhoodIds: nbhd, radiusMetres: radius ? Number(radius) : undefined, startsAt: fromLocalInput(start), endsAt: fromLocalInput(end), budgetCents: effModel === "cpm" ? cost : undefined }));
            if (r) router.push(`${base}/ads/${r.id}`);
          }}>
            Submit for review
          </Button>
        </Card>
        <aside className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
          <h2 className="text-title text-fg">Exactly as customers see it</h2>
          <PromoCard promo={{ title: headline || promo?.title || "Your headline", body: body || promo?.body, kind: promo?.kind ?? "offer", endsAt: fromLocalInput(end), imageUrl: promo?.imageUrl }} shop={detail.merchant} sponsored={{ advertiser: detail.merchant.name }} variant="feed" />
        </aside>
      </div>
    </div>
  );
}

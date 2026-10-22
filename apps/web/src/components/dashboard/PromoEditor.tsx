"use client";
import { CalendarDays, Gift, Megaphone, Percent, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { FeatureTeaser } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { PromoCard } from "@/components/ui/PromoCard";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { KIND_INFO, WEEKDAYS, promoBody, quickRange, validatePromo, type PromoDraft, type PromoKind } from "@/lib/dashboard/promos";
import { fromLocalInput } from "@/lib/dashboard/time";
import { useApi, useNow } from "@/lib/dashboard/useApi";

const KIND_ICON: Record<PromoKind, typeof Gift> = { offer: Gift, multiplier: Zap, bonus_points: Sparkles, discount: Percent, event: CalendarDays };

/** Promo editor (merchant-dashboard.md §6): kind tiles → fields → schedule (days + time windows) → preview. */
export function PromoEditor({ initial, promo }: { initial: PromoDraft; promo?: merchantApi.Promo }) {
  const { api, base, detail, enabled } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cats = useApi(() => api.categories(), [api]);
  const errors = tried ? validatePromo(d) : {};
  const live = promo?.status === "live";
  const locked = !!promo && !["draft", "scheduled"].includes(promo.status);
  const set = <K extends keyof PromoDraft>(k: K, v: PromoDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const now = useNow();
  const needsCategory = d.kind === "bonus_points" || d.kind === "multiplier" || d.kind === "discount";
  const startsInFuture = d.startsLocal ? new Date(fromLocalInput(d.startsLocal)!).getTime() > now + 60_000 : false;

  async function submit(publish: boolean) {
    setTried(true);
    if (Object.keys(validatePromo(d)).length) return;
    setBusy(publish ? "publish" : "draft");
    setError(null);
    try {
      let body = promoBody(d);
      if (live) body = { title: body.title, body: body.body, imageUrl: body.imageUrl, endsAt: body.endsAt };
      const p = promo ? await api.updatePromo(promo.id, body) : await api.createPromo({ ...body, publish });
      if (promo && publish && promo.status === "draft") await api.setPromoStatus(p.id, startsInFuture ? "scheduled" : "live");
      toast({ message: publish ? (startsInFuture ? "Scheduled" : "Your promo is live.") : "Saved", tone: "success" });
      router.push(`${base}/promos/${p.id}`);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const previewPromo = { title: d.title || "Your promo title", body: d.body || null, kind: d.kind, startsAt: fromLocalInput(d.startsLocal), endsAt: d.endsLocal ? fromLocalInput(d.endsLocal) : null, imageUrl: d.imageUrl || null, multiplierPct: Math.round((Number.parseFloat(d.multiplier) || 0) * 100), bonusPoints: Number.parseInt(d.bonusPoints, 10) || null, percentOff: Number.parseInt(d.percentOff, 10) || null };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {locked ? <Banner tone="info">{live ? "This promo is live: you can change the title, description, image and end date." : "Ended promos can't be edited."}</Banner> : null}
        <Card padding="lg">
          <fieldset disabled={!!promo && promo.status !== "draft" && promo.status !== "scheduled"}>
            <legend className="text-h3 text-fg">What kind of promo?</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(Object.keys(KIND_INFO) as PromoKind[]).map((k) => {
                const Icon = KIND_ICON[k];
                const disabled = (k === "multiplier" || k === "bonus_points") && !enabled("promos.double_points");
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled || live}
                    aria-pressed={d.kind === k}
                    onClick={() => set("kind", k)}
                    className={cn("flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center text-label focus-visible:focus-ring disabled:opacity-50", d.kind === k ? "border-brand bg-brand-subtle text-on-brand-subtle" : "border-border-strong text-fg hover:bg-surface-sunken")}
                  >
                    <Icon aria-hidden className="size-6" />
                    {KIND_INFO[k].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-body-sm text-fg-muted">{KIND_INFO[d.kind].hint}</p>
          </fieldset>
        </Card>

        <Card padding="lg">
          <div className="flex flex-col gap-4">
            <TextField label="Title" value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={60} showCount error={errors.title} placeholder="Double stamps on slow afternoons" disabled={locked && !live} />
            <TextField type="textarea" label="Description" optionalLabel value={d.body} onChange={(e) => set("body", e.target.value)} maxLength={280} showCount error={errors.body} disabled={locked && !live} />
            <TextField type="url" label="Image URL" optionalLabel hint="16:9 works best." value={d.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} disabled={locked && !live} />
            {d.kind === "multiplier" ? <TextField label="Multiplier" inputMode="decimal" suffix="x" value={d.multiplier} onChange={(e) => set("multiplier", e.target.value)} error={errors.multiplier} disabled={locked} /> : null}
            {d.kind === "bonus_points" ? <TextField label="Bonus per purchase" inputMode="numeric" suffix="pts" value={d.bonusPoints} onChange={(e) => set("bonusPoints", e.target.value.replace(/\D/g, ""))} error={errors.bonusPoints} disabled={locked} /> : null}
            {d.kind === "discount" ? <TextField label="Percent off" inputMode="numeric" suffix="%" value={d.percentOff} onChange={(e) => set("percentOff", e.target.value.replace(/\D/g, ""))} error={errors.percentOff} disabled={locked} /> : null}
            {needsCategory ? (
              <Select
                label="Only on a category"
                hint="No-earn categories (like prescriptions) can't be boosted or discounted."
                placeholder="Everything that earns"
                value={d.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                disabled={locked}
                options={(cats.data?.items ?? []).filter((c) => !c.protected && c.earnEligible).map((c) => ({ value: c.id, label: c.name }))}
              />
            ) : null}
            <Select label="Who sees it" value={d.audience} onChange={(e) => set("audience", e.target.value as PromoDraft["audience"])} disabled={locked} options={[{ value: "network", label: "Everyone on the network map and feed" }, { value: "members", label: "My members only" }, { value: "vip", label: "VIP members only" }]} />
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-h3 text-fg">When</h2>
          <ChipGroup label="Quick dates" className="mt-3">
            {([["today", "Today only"], ["weekend", "This weekend"], ["week", "1 week"]] as const).map(([k, l]) => (
              <Chip key={k} onClick={() => setD((x) => ({ ...x, ...quickRange(k) }))}>
                {l}
              </Chip>
            ))}
          </ChipGroup>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField type="datetime-local" label="Starts" value={d.startsLocal} onChange={(e) => set("startsLocal", e.target.value)} error={errors.startsLocal} disabled={locked} hint="Toronto time" />
            <TextField type="datetime-local" label="Ends" optionalLabel value={d.endsLocal} onChange={(e) => set("endsLocal", e.target.value)} error={errors.endsLocal} hint="Ended promos hide automatically." />
          </div>
          <fieldset className="mt-4" disabled={locked}>
            <legend className="text-label text-fg">Only on these days (optional)</legend>
            <ChipGroup label="Days of the week" className="mt-2">
              {WEEKDAYS.map((w, i) => (
                <Chip key={w} selected={d.daysOfWeek.includes(i)} onClick={() => set("daysOfWeek", d.daysOfWeek.includes(i) ? d.daysOfWeek.filter((x) => x !== i) : [...d.daysOfWeek, i])}>
                  {w}
                </Chip>
              ))}
            </ChipGroup>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField type="time" label="From (time)" optionalLabel value={d.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors.startTime} disabled={locked} />
            <TextField type="time" label="Until (time)" optionalLabel value={d.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={locked} />
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="text-h3 text-fg">Tell your regulars</h2>
          <p className="mt-1 text-body-sm text-fg-muted">Send this promo by email to customers who said yes to offers.</p>
          <Button variant="tonal" className="mt-3" iconStart={Megaphone} href={`${base}/messages/new?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(d.body || d.title)}`}>
            Also email opted-in members
          </Button>
          {!enabled("marketing.sms") ? <div className="mt-4"><FeatureTeaser featureKey="marketing.sms" title="SMS campaigns" /></div> : null}
          <div className="mt-4">
            {enabled("ads.sponsored_promo") && promo?.status === "live" ? (
              <Link href={`${base}/ads/new?promoId=${promo.id}`} className="text-label text-fg-link underline">
                Boost this promo
              </Link>
            ) : (
              <FeatureTeaser featureKey="ads.sponsored_promo" title="Boost this promo" />
            )}
          </div>
        </Card>

        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className="flex flex-wrap gap-2">
          {!promo || promo.status === "draft" ? (
            <>
              <Button loading={busy === "publish"} onClick={() => submit(true)}>
                {startsInFuture ? "Schedule" : "Publish now"}
              </Button>
              <Button variant="secondary" loading={busy === "draft"} onClick={() => submit(false)}>
                Save draft
              </Button>
            </>
          ) : promo.status === "scheduled" || live ? (
            <Button loading={busy === "draft"} onClick={() => submit(false)}>
              Save changes
            </Button>
          ) : null}
        </div>
      </div>
      <aside aria-label="Preview" className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-title text-fg">Preview</h2>
        <p className="text-body-sm text-fg-muted">How it looks in the neighbourhood feed.</p>
        <PromoCard promo={previewPromo} shop={{ ...detail.merchant, neighbourhood: null }} variant="feed" />
      </aside>
    </div>
  );
}

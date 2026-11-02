"use client";
import { Panel } from "@/components/dashboard/kit";
import { CalendarDays, Gift, Megaphone, Percent, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { promosApi, type merchantApi } from "@ll/shared";
import { PromoAiWriter } from "@/components/dashboard/PromoAiWriter";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { DEAL_TILE, DealCard } from "@/components/pass/DealCard";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { HOLIDAY_LABEL, KIND_INFO, SEGMENT_LABEL, TYPE_INFO, WEEKDAYS, applyType, promoBody, quickRange, validatePromo, type PromoDraft, type PromoKind } from "@/lib/dashboard/promos";
import { fromLocalInput } from "@/lib/dashboard/time";
import { useApi, useNow } from "@/lib/dashboard/useApi";

const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const fromYmd = (v: string) => {
  const [y, m, day] = v.slice(0, 10).split("-").map(Number);
  return y && m && day ? new Date(y, m - 1, day) : undefined;
};

/** A "YYYY-MM-DDTHH:mm" (Toronto wall time) value as a day picker plus a time field. */
function DateTimeField({ id, label, value, onChange, error, hint, disabled, defaultTime, clearable, notBefore }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; disabled?: boolean; defaultTime: string; clearable?: boolean; notBefore?: string }) {
  const day = value ? fromYmd(value) : undefined;
  const time = value.slice(11, 16);
  const min = notBefore ? fromYmd(notBefore) : undefined;
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-1.5" aria-describedby={`${id}-note`}>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-2">
        <DatePicker id={id} label={label} value={day} onChange={(x) => (x ? onChange(`${ymd(x)}T${time || defaultTime}`) : clearable ? onChange("") : undefined)} disabled={min ? { before: min } : undefined} />
        <TextField type="time" label={`${label.replace(" (optional)", "")}, time`} hideLabel className="clear:md:min-h-11" value={time} disabled={disabled || !value} onChange={(e) => value && onChange(`${value.slice(0, 10)}T${e.target.value || defaultTime}`)} />
      </div>
      <p id={`${id}-note`} className={cn("flex items-center gap-2 text-meta", error ? "font-medium text-negative" : "text-fg-muted")}>
        <span className="min-w-0 flex-1">{error ?? hint}</span>
        {clearable && value && !disabled ? (
          <button type="button" onClick={() => onChange("")} className="relative inline-flex items-center text-meta font-medium text-fg underline underline-offset-4 after:absolute after:-inset-3 focus-visible:focus-ring">
            Clear
          </button>
        ) : null}
      </p>
    </fieldset>
  );
}

/** "Double stamps" or "Double points": the type names follow the shop's own word. */
const typeLabel = (k: promosApi.PromoType, term: string) => (k === "double_stamps" ? `Double ${term}` : k === "bonus_stamps" ? `Bonus ${term}` : TYPE_INFO[k].label);

const KIND_ICON: Record<PromoKind, typeof Gift> = { offer: Gift, multiplier: Zap, bonus_points: Sparkles, discount: Percent, event: CalendarDays };

/**
 * Promo editor (wave N): "Write it for me" → type → offer → words → who and where → when → customer preview. Every field is
 * editable, live promos included (pause first if you like). Nothing is sent until Publish.
 */
export function PromoEditor({ initial, promo }: { initial: PromoDraft; promo?: merchantApi.Promo }) {
  const { api, base, detail, enabled } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const cats = useApi(() => api.categories(), [api]);
  const svc = useApi(() => api.appointments.services().catch(() => ({ items: [] as { id: string; name: string; active?: boolean }[] })), [api]);
  const catalog = useApi(() => api.catalog().catch(() => ({ items: [], categories: [] })), [api]);
  const [audience, setAudience] = useState<promosApi.PromoAudiencePreview | null>(null);
  const errors = tried ? validatePromo(d) : {};
  const live = promo?.status === "live";
  const locked = !!promo && !["draft", "scheduled", "live"].includes(promo.status);
  const set = <K extends keyof PromoDraft>(k: K, v: PromoDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const now = useNow();
  const term = detail.program?.terminology ?? "points";
  const unit = term === "stamps" ? "stamps" : "pts";
  const needsCategory = d.kind === "bonus_points" || d.kind === "multiplier" || d.kind === "discount";
  const startsInFuture = d.startsLocal ? new Date(fromLocalInput(d.startsLocal)!).getTime() > now + 60_000 : false;
  const boosts = enabled("promos.double_points");

  useEffect(() => {
    let on = true;
    api.promoAudience(d.segment).then((r) => on && setAudience(r)).catch(() => on && setAudience(null));
    return () => {
      on = false;
    };
  }, [api, d.segment]);

  async function submit(publish: boolean) {
    setTried(true);
    if (Object.keys(validatePromo(d)).length) return;
    setBusy(publish ? "publish" : "draft");
    setError(null);
    try {
      const body = promoBody(d);
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

  const items = [
    ...(svc.data?.items ?? []).filter((s) => s.active !== false).map((s) => ({ id: s.id, name: s.name })),
    ...(catalog.data?.items ?? []).map((i) => ({ id: i.id, name: i.name })),
  ].slice(0, 40);

  const preview: promosApi.DealDto = {
    id: promo?.id ?? "preview",
    merchant: { id: detail.merchant.id, name: detail.merchant.name, slug: detail.merchant.slug, brandColor: detail.merchant.brandColor ?? null, vertical: detail.merchant.vertical, logoUrl: detail.merchant.logoUrl ?? null },
    memberId: null,
    title: d.title || "Your promo title",
    body: d.body || null,
    imageUrl: d.imageUrl || null,
    color: d.color || null,
    promoType: d.promoType,
    kind: d.kind,
    multiplierPct: Math.round((Number.parseFloat(d.multiplier) || 0) * 100) || null,
    bonusPoints: Number.parseInt(d.bonusPoints, 10) || null,
    percentOff: Number.parseInt(d.percentOff, 10) || null,
    daysOfWeek: d.daysOfWeek.length ? d.daysOfWeek : null,
    startTime: d.startTime || null,
    endTime: d.endTime || null,
    startsAt: fromLocalInput(d.startsLocal) ?? new Date().toISOString(),
    endsAt: d.endsLocal ? fromLocalInput(d.endsLocal) : null,
    activeNow: !startsInFuture,
    upcoming: startsInFuture,
    quantityCap: d.quantityCap ? Number.parseInt(d.quantityCap, 10) || null : null,
    remaining: d.quantityCap ? Math.max(0, (Number.parseInt(d.quantityCap, 10) || 0) - (promo?.claimedCount ?? 0)) : null,
    claim: null,
    unread: true,
    optedIn: true,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {locked ? <Banner tone="info">Ended promos can’t be edited. Duplicate it to run it again.</Banner> : live ? <Banner tone="info">This promo is live, so changes apply right away. Pause it first to take it down while you edit.</Banner> : null}

        {!promo ? (
          <PromoAiWriter
            onDraft={(next, note) => {
              setD((cur) => next(cur));
              setAiNote(note);
              setTried(false);
            }}
          />
        ) : null}
        {aiNote ? <Banner tone="info">{aiNote}</Banner> : null}

        <Panel>
          <fieldset disabled={locked} className="min-w-0">
            <legend className="text-body-strong text-fg">What kind of promo?</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {promosApi.PROMO_TYPES.map((k) => {
                const needsBoost = promosApi.PROMO_TYPE_DEFAULTS[k].kind === "multiplier" || promosApi.PROMO_TYPE_DEFAULTS[k].kind === "bonus_points";
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={needsBoost && !boosts}
                    aria-pressed={d.promoType === k}
                    onClick={() => setD((x) => applyType(x, k))}
                    className={cn("flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-input border p-3 text-start text-label focus-visible:focus-ring disabled:opacity-50", d.promoType === k ? "border-fg bg-bg-subtle text-fg shadow-[inset_0_0_0_1px_var(--ll-color-fg)]" : "border-line-strong text-fg hover:bg-bg-subtle")}
                    data-testid={`promo-type-${k}`}
                  >
                    {typeLabel(k, term)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-meta text-fg-muted">{TYPE_INFO[d.promoType].hint.replaceAll("stamps", term)}</p>
          </fieldset>
        </Panel>

        <Panel>
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
            <legend className="text-body-strong text-fg">What they get</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {(Object.keys(KIND_INFO) as PromoKind[]).map((k) => {
                const Icon = KIND_ICON[k];
                const disabled = (k === "multiplier" || k === "bonus_points") && !boosts;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    aria-pressed={d.kind === k}
                    onClick={() => set("kind", k)}
                    className={cn("flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-input border p-2 text-center text-label focus-visible:focus-ring disabled:opacity-50", d.kind === k ? "border-fg bg-bg-subtle text-fg shadow-[inset_0_0_0_1px_var(--ll-color-fg)]" : "border-line-strong text-fg hover:bg-bg-subtle")}
                  >
                    <Icon aria-hidden className="size-5" />
                    {k === "multiplier" ? `Multiply ${term}` : k === "bonus_points" ? `Extra ${term}` : KIND_INFO[k].label}
                  </button>
                );
              })}
            </div>
            {d.kind === "multiplier" ? <TextField label="Multiplier" inputMode="decimal" suffix="x" value={d.multiplier} onChange={(e) => set("multiplier", e.target.value)} error={errors.multiplier} /> : null}
            {d.kind === "bonus_points" ? <TextField label={`Extra ${term} per visit`} inputMode="numeric" suffix={unit} value={d.bonusPoints} onChange={(e) => set("bonusPoints", e.target.value.replace(/\D/g, ""))} error={errors.bonusPoints} /> : null}
            {d.kind === "discount" ? <TextField label="Percent off" inputMode="numeric" suffix="%" value={d.percentOff} onChange={(e) => set("percentOff", e.target.value.replace(/\D/g, ""))} error={errors.percentOff} /> : null}
            {d.promoType === "door_crasher" || d.quantityCap ? (
              <TextField label="Spots (first come)" hint="People save a spot in the app and see how many are left. It never goes past this number." inputMode="numeric" value={d.quantityCap} onChange={(e) => set("quantityCap", e.target.value.replace(/\D/g, ""))} error={errors.quantityCap} data-testid="promo-quantity" />
            ) : null}
            {d.promoType === "seasonal" ? (
              <Select label="Occasion" placeholder="Pick one" value={d.holiday} onChange={(e) => set("holiday", e.target.value)} options={promosApi.PROMO_HOLIDAYS.map((h) => ({ value: h, label: HOLIDAY_LABEL[h] }))} />
            ) : null}
            {needsCategory ? (
              <Select
                label="Only on a category"
                hint="No-earn categories (like prescriptions) can't be boosted or discounted."
                placeholder="Everything that earns"
                value={d.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                options={(cats.data?.items ?? []).filter((c) => !c.protected && c.earnEligible).map((c) => ({ value: c.id, label: c.name }))}
              />
            ) : null}
            {items.length ? (
              <div>
                <p className="text-label text-fg">Which services or items (optional)</p>
                <ChipGroup label="Eligible services or items" className="mt-2 flex-wrap overflow-visible">
                  {items.map((it) => (
                    <Chip key={it.id} selected={d.itemIds.includes(it.id)} onClick={() => set("itemIds", d.itemIds.includes(it.id) ? d.itemIds.filter((x) => x !== it.id) : [...d.itemIds, it.id])}>
                      {it.name}
                    </Chip>
                  ))}
                </ChipGroup>
                <p className="mt-1 text-meta text-fg-muted">None picked means everything that earns.</p>
              </div>
            ) : null}
            {detail.program?.maxStampsPerDay && (d.kind === "multiplier" || d.kind === "bonus_points") ? (
              <p className="text-meta text-fg-muted">Your daily limit of {detail.program.maxStampsPerDay} {term} still applies on promo days.</p>
            ) : null}
          </fieldset>
        </Panel>

        <Panel>
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
            <legend className="text-body-strong text-fg">The words</legend>
            <TextField label="Title" value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={60} showCount error={errors.title} placeholder={`Double ${term} on slow afternoons`} />
            <TextField type="textarea" label="Description" optionalLabel value={d.body} onChange={(e) => set("body", e.target.value)} maxLength={280} showCount error={errors.body} />
            <TextField label="Notification text" optionalLabel hint="The line people see on their phone. Your shop name is added as the sender." value={d.notifyText} onChange={(e) => set("notifyText", e.target.value)} maxLength={160} showCount error={errors.notifyText} />
            <TextField type="url" label="Image URL" optionalLabel hint="16:9 works best." value={d.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} />
            <div>
              <p className="text-label text-fg">Card colour</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Card colour">
                <button type="button" role="radio" aria-checked={!d.color} aria-label="No colour" onClick={() => set("color", "")} className={cn("size-11 rounded-full border border-line-strong bg-card focus-visible:focus-ring", !d.color ? "ring-2 ring-fg" : "")} />
                {promosApi.PROMO_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={c.charAt(0).toUpperCase() + c.slice(1)} onClick={() => set("color", c)} className={cn("size-11 rounded-full border border-line focus-visible:focus-ring", DEAL_TILE[c], d.color === c ? "ring-2 ring-fg" : "")} />
                ))}
              </div>
            </div>
          </fieldset>
        </Panel>

        <Panel>
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
            <legend className="text-body-strong text-fg">Who it’s for and how they hear</legend>
            <Select label="Who it's for" value={d.segment} onChange={(e) => set("segment", e.target.value as PromoDraft["segment"])} options={promosApi.PROMO_SEGMENTS.map((s) => ({ value: s, label: SEGMENT_LABEL[s] }))} data-testid="promo-segment" />
            <p className="-mt-2 text-meta text-fg-muted" aria-live="polite">
              {audience ? `${audience.members} ${audience.members === 1 ? "customer" : "customers"}. ${audience.reachable} said yes to offers and can get a notification.` : " "}
            </p>
            {d.segment === "everyone" ? (
              <Checkbox checked={d.audience === "network"} onChange={(v) => set("audience", v ? "network" : "members")} label="Also show it on my public shop page and the neighbourhood feed" />
            ) : (
              <p className="text-meta text-fg-muted">Only these customers see it, under Offers in their app.</p>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-label text-fg">Tell them by</p>
              <Checkbox checked disabled onChange={() => undefined} label="Offers in the app" caption="Always on." />
              <Checkbox checked={d.channels.includes("push")} onChange={(v) => set("channels", v ? [...new Set([...d.channels, "push" as const])] : d.channels.filter((c) => c !== "push"))} label="App and browser notification" />
              <Checkbox checked={d.channels.includes("email")} onChange={(v) => set("channels", v ? [...new Set([...d.channels, "email" as const])] : d.channels.filter((c) => c !== "email"))} label="Email, when they can't get a notification" />
              <p className="text-meta text-fg-muted">Only people who said yes to your offers get a message: at most 2 a week, never 9 pm to 8 am. Each one names your shop and has a way to stop. Offers never go by text.</p>
            </div>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-body-strong text-fg">When</h2>
          <ChipGroup label="Quick dates" className="mt-3">
            {([["today", "Today only"], ["weekend", "This weekend"], ["week", "1 week"]] as const).map(([k, l]) => (
              <Chip key={k} onClick={() => setD((x) => ({ ...x, ...quickRange(k) }))}>
                {l}
              </Chip>
            ))}
          </ChipGroup>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Wave Q: a day from the kit DatePicker (a month in a popover, the shop's language) and a time beside it, not datetime-local. */}
            <DateTimeField id="promo-starts" label="Starts" value={d.startsLocal} onChange={(v) => set("startsLocal", v)} error={errors.startsLocal} disabled={locked} hint="Toronto time" defaultTime="09:00" />
            <DateTimeField id="promo-ends" label="Ends (optional)" value={d.endsLocal} onChange={(v) => set("endsLocal", v)} error={errors.endsLocal} disabled={locked} hint="Ended promos hide automatically." defaultTime="23:59" clearable notBefore={d.startsLocal} />
          </div>
          <fieldset className="mt-4 min-w-0" disabled={locked}>
            <legend className="text-label text-fg">Only on these days (optional)</legend>
            <ChipGroup label="Days of the week" className="mt-2 flex-wrap overflow-visible">
              {WEEKDAYS.map((w, i) => (
                <Chip key={w} selected={d.daysOfWeek.includes(i)} onClick={() => set("daysOfWeek", d.daysOfWeek.includes(i) ? d.daysOfWeek.filter((x) => x !== i) : [...d.daysOfWeek, i])}>
                  {w}
                </Chip>
              ))}
            </ChipGroup>
            {errors.daysOfWeek ? <p className="mt-1 text-meta text-negative">{errors.daysOfWeek}</p> : null}
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField type="time" label="From (time)" optionalLabel value={d.startTime} onChange={(e) => set("startTime", e.target.value)} error={errors.startTime} disabled={locked} />
            <TextField type="time" label="Until (time)" optionalLabel value={d.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={locked} />
          </div>
        </Panel>

        <Panel>
          <h2 className="text-body-strong text-fg">More ways to tell people</h2>
          <Button variant="tonal" className="mt-3" iconStart={Megaphone} href={`${base}/messages/new?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(d.body || d.title)}`}>
            Write a campaign about it
          </Button>
          {/* Wave P: boosting only shows when it can be done; the "opens once N shops" notice was a dead end in the middle of a form. */}
          {enabled("ads.sponsored_promo") && promo?.status === "live" ? (
            <div className="mt-4">
              <Link href={`${base}/ads/new?promoId=${promo.id}`} className="text-label text-fg underline">
                Boost this promo
              </Link>
            </div>
          ) : null}
        </Panel>

        {error ? <Banner tone="danger">{error}</Banner> : null}
        {/* Wave P: the save row stays in reach on a long form (above the phone tab bar). */}
        <div className="promo-actions sticky bottom-[calc(96px+env(safe-area-inset-bottom))] z-10 flex flex-wrap gap-2 rounded-card bg-card/95 p-3 shadow-card backdrop-blur md:bottom-4">
          {!promo || promo.status === "draft" ? (
            <>
              <Button loading={busy === "publish"} onClick={() => submit(true)} data-testid="promo-publish">
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
      <aside aria-label="Preview" className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <h2 className="text-meta text-fg-muted">Preview</h2>
        <p className="text-meta text-fg-muted">How customers see it under Offers.</p>
        <div data-testid="promo-preview">
          <DealCard deal={preview} terminology={term} onClaim={() => undefined} />
        </div>
      </aside>
    </div>
  );
}

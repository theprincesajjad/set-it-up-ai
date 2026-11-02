"use client";
/**
 * Steps 3 to 5: what kind of shop (eight popular tiles and a search for the rest), where clients find you (three tiles, then the
 * address only for a storefront and a postal code for a home studio), and the loyalty card (the trade's defaults, editable, with a
 * live preview in the shop's colour).
 */
import { Check, Palette } from "lucide-react";
import { useMemo, useState } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, merchantApi, normalizePostal, unitWord, type Locale, type MessageKey } from "@ll/shared";
import type { Icon3dName } from "@ll/design-tokens";
import { cn } from "@/lib/cn";
import { shopColorProps } from "@/lib/shopColor";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { ColorField } from "@/components/ui/ColorField";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Icon3d } from "@/components/ui/Icon3d";
import { TextField } from "@/components/ui/TextField";
import { ChoiceGroup, ChoiceTile } from "../ChoiceTile";
import { CardPreview } from "./CardPreview";
import { cardFor, workFor, type Work } from "./draft";
import { StepFrame } from "./Shell";
import type { StepProps } from "./StepsIntro";

/** The eight types most owners pick, in that order. Everything else is one search away. */
export const POPULAR = ["nails", "brows_lashes", "barber", "salon", "cafe", "bakery", "restaurant", "retail"] as const;
/** Types with a translated signup chip (su.chip.*); the rest have sf.v.* labels. */
const CHIP = new Set(["nails", "brows_lashes", "barber", "salon", "makeup", "cafe", "bakery", "restaurant", "restaurant_south_asian", "tiffin", "caterer", "banquet_hall", "retail", "grocery", "pharmacy", "fitness", "pet", "repair_auto", "repair_electronics"]);

export function tradeLabel(t: ReturnType<typeof useLocaleOrEnglish>["t"], v: string): string {
  if (!v) return "";
  if (CHIP.has(v)) return t(`su.chip.${v}` as MessageKey);
  return t(`sf.v.${v}` as MessageKey);
}

const ICON: Partial<Record<string, Icon3dName>> = {
  nails: "nails", brows_lashes: "brows_lashes", makeup: "makeup", barber: "barber", salon: "salon", spa: "beauty", beauty_supply: "beauty",
  cafe: "cafe", bakery: "bakery", restaurant: "eat", restaurant_south_asian: "eat", tiffin: "eat", caterer: "eat", banquet_hall: "eat", bar: "eat",
  grocery: "butcher", pet: "pet_shop", repair_auto: "repair", repair_electronics: "repair", car_wash: "repair", retail: "shops", bookstore: "shops",
  florist: "shops", pharmacy: "shops", print_shop: "services", alterations: "services", dry_cleaning: "services", fitness: "top", other: "services",
};
export const iconFor = (v: string): Icon3dName => ICON[v] ?? "shops";

// ---------------------------------------------------------------------------
// 3. What kind of shop?
// ---------------------------------------------------------------------------
export function KindStep({ draft, update, next }: StepProps) {
  const { t } = useLocaleOrEnglish();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const v = draft.vertical;
  const tiles: string[] = v && !(POPULAR as readonly string[]).includes(v) ? [v, ...POPULAR.slice(0, 7)] : [...POPULAR];
  const all = useMemo(() => VERTICALS.map((x) => ({ v: x, label: tradeLabel(t, x), en: VERTICAL_TEMPLATES[x].label })), [t]);
  const needle = q.trim().toLowerCase();
  const matches = needle ? all.filter((x) => x.label.toLowerCase().includes(needle) || x.en.toLowerCase().includes(needle) || x.v.replace(/_/g, " ").includes(needle)).slice(0, 8) : [];
  const pick = (x: string) => {
    setError(null);
    update({ vertical: x, verticalGuess: false, ...(draft.workTouched ? {} : { work: workFor(x) }) });
  };
  const go = () => {
    if (!draft.vertical) return setError(t("su.err.kind"));
    if (draft.verticalGuess) update({ verticalGuess: false });
    next();
  };
  return (
    <StepFrame id="kind" title={t("sf.kind.title")} body={t("sf.kind.body")} onSubmit={go} primary={t("sf.continue")}>
      <div className="flex flex-col gap-2">
        <ChoiceGroup aria-label={t("su.kind")} value={v || null} onValueChange={pick} className="grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((x) => (
            <TradeTile key={x} value={x} label={tradeLabel(t, x)} checked={v === x} onPick={pick} badge={v === x && draft.verticalGuess ? t("sf.kind.suggested") : null} />
          ))}
        </ChoiceGroup>
        {error ? (
          <p role="alert" className="text-meta font-medium text-negative">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        <TextField name="tradeSearch" label={t("sf.kind.search")} placeholder={t("sf.kind.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {needle ? (
          matches.length ? (
            <div role="radiogroup" aria-label={t("sf.kind.results")} className="flex flex-col divide-y divide-border overflow-hidden rounded-r4 border border-border bg-card" data-trade-results>
              {matches.map((x) => (
                <button key={x.v} type="button" role="radio" aria-checked={v === x.v} data-vertical={x.v} onClick={() => pick(x.v)} className={cn("flex min-h-12 items-center gap-3 px-3 text-start text-body font-[550] text-fg hover:bg-bg-subtle focus-visible:focus-ring", v === x.v && "bg-bg-subtle")}>
                  <Icon3d name={iconFor(x.v)} size={40} trade={x.v} />
                  {x.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-meta text-fg-muted">{t("sf.kind.none")}</p>
          )
        ) : null}
      </div>
      {v === "other" ? <TextField label={t("su.sells")} optionalLabel maxLength={300} value={draft.sells} onChange={(e) => update({ sells: e.target.value })} /> : null}
    </StepFrame>
  );
}

function TradeTile({ value, label, checked, onPick, badge }: { value: string; label: string; checked: boolean; onPick: (v: string) => void; badge: string | null }) {
  // Wave Q: a raised tile. The 3D object sits on a soft disc in its own trade colour; picked, the tile takes that colour's soft fill and
  // ring with a check in the corner, and the object lifts a little. Hover lifts the tile (not under reduced motion).
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-value={value}
      data-vertical={value}
      data-trade={value}
      tabIndex={checked ? 0 : -1}
      onClick={() => onPick(value)}
      className={cn(
        "group relative flex min-h-28 flex-col items-start justify-between gap-3 rounded-r4 border bg-card p-3.5 text-start shadow-sm transition-[box-shadow,transform,background-color,border-color] duration-200 ease-out focus-visible:focus-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        checked ? "border-trade bg-trade-soft shadow-[0_0_0_1px_var(--trade)]" : "border-border hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float motion-reduce:hover:translate-y-0",
      )}
    >
      <span className={cn("grid size-13 place-items-center rounded-full transition-[transform,background-color] duration-200 motion-reduce:transition-none", checked ? "scale-105 bg-card" : "bg-bg-subtle group-hover:scale-105")}>
        <Icon3d name={iconFor(value)} size={40} trade={value} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-[600] leading-5 text-fg">{label}</span>
        {badge ? <span className="self-start rounded-full bg-card px-2 py-0.5 text-caption font-[550] text-trade-deep ring-1 ring-trade/20">{badge}</span> : null}
      </span>
      <span aria-hidden className={cn("absolute end-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-trade text-trade-foreground transition-[opacity,transform] duration-200 motion-reduce:transition-none", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 4. Where do clients find you?
// ---------------------------------------------------------------------------
const WORK_ICON: Record<Work, Icon3dName> = { home: "pin_area", shop: "shops", mobile: "domain" };

export function WhereStep({ draft, update, next }: StepProps) {
  const { t } = useLocaleOrEnglish();
  const [errors, setErrors] = useState<{ address?: string; postal?: string }>({});
  const go = () => {
    const e: typeof errors = {};
    if (draft.work === "shop" && draft.address.trim().length < 3) e.address = t("su.err.street");
    if (draft.work === "home" && !normalizePostal(draft.postal)) e.postal = t("su.err.postal");
    setErrors(e);
    if (!Object.keys(e).length) next();
  };
  return (
    <StepFrame id="where" title={t("sf.where.title")} body={t("sf.where.body")} onSubmit={go} primary={t("sf.continue")}>
      <ChoiceGroup aria-label={t("su.where")} value={draft.work} onValueChange={(w) => { setErrors({}); update({ work: w as Work, workTouched: true }); }} className="sm:grid-cols-1">
        {(["shop", "home", "mobile"] as const).map((w) => (
          <ChoiceTile key={w} value={w} icon={WORK_ICON[w]} trade={draft.vertical || null} label={t(`su.where.${w}`)} hint={t(`su.where.${w}Hint`)} className="sm:flex-row sm:items-center sm:gap-4" />
        ))}
      </ChoiceGroup>
      <div key={draft.work} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
        {draft.work === "shop" ? <TextField name="street" label={t("su.street")} autoComplete="street-address" hint={t("su.streetHint")} value={draft.address} onChange={(e) => update({ address: e.target.value })} error={errors.address} /> : null}
        {draft.work === "home" ? (
          <div className="flex flex-col gap-3">
            <TextField name="postal" label={t("su.postal")} autoComplete="postal-code" hint={t("su.postalHint")} value={draft.postal} onChange={(e) => update({ postal: e.target.value.toUpperCase() })} error={errors.postal} maxLength={7} dir="ltr" className="max-w-55" />
            <p className="rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg">{t("su.privateNote")}</p>
          </div>
        ) : null}
        {draft.work === "mobile" ? <p className="rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg">{t("sf.where.mobileNote")}</p> : null}
      </div>
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------
// 5. Your loyalty card
// ---------------------------------------------------------------------------
export function LoyaltyStep({ draft, update, next }: StepProps) {
  const { t, locale } = useLocaleOrEnglish();
  const card = cardFor(draft.vertical, draft.card);
  const [errors, setErrors] = useState<{ goal?: string; reward?: string }>({});
  const unit = unitWord(locale as Locale, card.terminology);
  const set = (patch: Partial<{ goal: number; reward: string }>) => update({ card: { goal: card.goal, reward: card.reward, ...patch } });
  const go = () => {
    const e: typeof errors = {};
    const n = card.goal;
    if (!Number.isInteger(n) || n < card.min || n > card.max) e.goal = card.earnType === "stamps" ? t("sf.err.goal", { min: merchantApi.STAMP_GOAL_MIN, max: merchantApi.STAMP_GOAL_MAX }) : t("sf.err.points");
    if (!card.reward.trim()) e.reward = t("sf.err.reward");
    setErrors(e);
    if (!Object.keys(e).length) next();
  };
  const earn = card.earnType === "stamps" ? t("sf.card.earnStamp") : card.earnType === "per_visit" ? t("sf.card.earnVisit", { n: card.rate, unit }) : t("sf.card.earnDollar", { n: card.rate, unit });
  const changed = card.goal !== card.defaults.goal || card.reward !== card.defaults.reward;
  // The colour: what "Is this you?" kept from the website, else the owner's pick here (wave Q, ColorField), else the trade's.
  const imported = draft.link === "read" && !!draft.accepted;
  const brandColor = imported ? (draft.accepted?.brandColor ?? null) : draft.color;
  const [colourOpen, setColourOpen] = useState(!!draft.color);
  return (
    <StepFrame id="card" title={t("sf.card.title")} body={t("sf.card.body")} onSubmit={go} primary={t("sf.continue")}>
      <div className="lg:hidden">
        <CardPreview name={draft.name} vertical={draft.vertical} brandColor={brandColor} logo={draft.accepted?.logoPreview ?? null} card={card} />
      </div>
      {/* Kit (wave Q): NumberStepper (Base UI NumberField: arrow keys, Page Up/Down, hold to repeat, clamped to the trade's range). */}
      <NumberStepper
        name="goal"
        label={card.earnType === "stamps" ? t("sf.card.goalStamps") : t("sf.card.goalPoints", { unit })}
        value={card.goal}
        onChange={(n) => {
          setErrors((e) => ({ ...e, goal: undefined }));
          set({ goal: n });
        }}
        min={card.min}
        max={card.max}
        step={card.step}
        hint={earn}
        error={errors.goal}
        decreaseLabel={t("sf.card.less")}
        increaseLabel={t("sf.card.more")}
      />
      <div className="flex flex-col gap-2">
        <TextField name="reward" label={t("sf.card.reward")} hint={t("sf.card.rewardHint")} value={card.reward} maxLength={120} onChange={(e) => set({ reward: e.target.value })} error={errors.reward} />
        {card.suggestions.length > 1 || changed ? (
          <div className="flex flex-wrap gap-2">
            {[...new Set([card.defaults.reward, ...card.suggestions])].filter(Boolean).map((s) => (
              <button key={s} type="button" onClick={() => set({ reward: s })} aria-pressed={card.reward === s} className={cn("inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-meta font-[550] transition-colors duration-150 focus-visible:focus-ring motion-reduce:transition-none", card.reward === s ? "border-fg bg-fg text-bg" : "border-border bg-card text-fg hover:bg-bg-subtle")}>
                {card.reward === s ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!imported ? (
        <div className="flex flex-col gap-2" data-card-colour>
          {colourOpen ? (
            <div className="rounded-r4 border border-border bg-card p-4 shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
              <ColorField label={t("sf.shop.colour")} value={draft.color} onChange={(c) => update({ color: c })} vertical={draft.vertical || null} />
              {draft.color ? (
                <button type="button" onClick={() => update({ color: null })} className="mt-2 inline-flex h-11 items-center rounded-full px-1 text-body font-[550] text-link hover:underline focus-visible:focus-ring" data-card-colour-reset>
                  {t("sf.card.colourReset")}
                </button>
              ) : null}
            </div>
          ) : (
            <button type="button" onClick={() => setColourOpen(true)} className="flex min-h-14 items-center gap-3 rounded-r4 border border-border bg-card px-3 py-2 text-start shadow-sm hover:bg-bg-subtle focus-visible:focus-ring" data-card-colour-open>
              <span {...shopColorProps({ vertical: draft.vertical || null, brandColor: draft.color })} aria-hidden className="size-9 shrink-0 rounded-full bg-trade ring-1 ring-inset ring-trade-foreground/20" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-[550] text-fg">{t("sf.shop.colour")}</span>
                <span className="block text-meta text-fg-muted">{draft.color ? <span dir="ltr">{draft.color}</span> : t("sf.shop.colourTrade")}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-meta font-[600] text-link">
                <Palette aria-hidden className="size-4" strokeWidth={1.8} />
                {t("sf.shop.otherColour")}
              </span>
            </button>
          )}
          <p className="text-meta text-fg-muted">{t("sf.card.colourHint")}</p>
        </div>
      ) : null}
      {draft.vertical === "pharmacy" ? <p className="rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg">{t("sf.card.pharmacy")}</p> : null}
      <p className="text-meta text-fg-muted">{t("sf.card.later")}</p>
    </StepFrame>
  );
}

"use client";
/**
 * Steps 3 to 5: what kind of shop (eight popular tiles and a search for the rest), where clients find you (three tiles, then the
 * address only for a storefront and a postal code for a home studio), and the loyalty card (the trade's defaults, editable, with a
 * live preview in the shop's colour).
 */
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, merchantApi, normalizePostal, unitWord, type Locale, type MessageKey } from "@ll/shared";
import type { Icon3dName } from "@ll/design-tokens";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
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
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-value={value}
      data-vertical={value}
      tabIndex={checked ? 0 : -1}
      onClick={() => onPick(value)}
      className={cn(
        "relative flex min-h-24 flex-col items-start justify-between gap-2 rounded-r4 border bg-card p-3.5 text-start transition-[box-shadow,transform] duration-150 focus-visible:focus-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        checked ? "border-fg shadow-[0_0_0_1px_var(--foreground)]" : "border-border hover:bg-bg-subtle",
      )}
    >
      <Icon3d name={iconFor(value)} size={40} trade={value} />
      <span className="text-sm font-[550] leading-5 text-fg">{label}</span>
      {badge ? <span className="absolute end-2 top-2 rounded-full bg-trade-soft px-2 py-0.5 text-caption font-[550] text-trade-deep">{badge}</span> : null}
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
  const [goalText, setGoalText] = useState(String(card.goal));
  const unit = unitWord(locale as Locale, card.terminology);
  const set = (patch: Partial<{ goal: number; reward: string }>) => update({ card: { goal: card.goal, reward: card.reward, ...patch } });
  const setGoal = (n: number) => {
    const c = Math.min(card.max, Math.max(card.min, n));
    setGoalText(String(c));
    set({ goal: c });
  };
  const go = () => {
    const e: typeof errors = {};
    const n = Number(goalText);
    if (!Number.isInteger(n) || n < card.min || n > card.max) e.goal = card.earnType === "stamps" ? t("sf.err.goal", { min: merchantApi.STAMP_GOAL_MIN, max: merchantApi.STAMP_GOAL_MAX }) : t("sf.err.points");
    if (!card.reward.trim()) e.reward = t("sf.err.reward");
    setErrors(e);
    if (!Object.keys(e).length) next();
  };
  const earn = card.earnType === "stamps" ? t("sf.card.earnStamp") : card.earnType === "per_visit" ? t("sf.card.earnVisit", { n: card.rate, unit }) : t("sf.card.earnDollar", { n: card.rate, unit });
  const changed = card.goal !== card.defaults.goal || card.reward !== card.defaults.reward;
  return (
    <StepFrame id="card" title={t("sf.card.title")} body={t("sf.card.body")} onSubmit={go} primary={t("sf.continue")}>
      <div className="lg:hidden">
        <CardPreview name={draft.name} vertical={draft.vertical} brandColor={draft.accepted?.brandColor} logo={draft.accepted?.logoPreview ?? null} card={card} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sf-goal" className="text-body font-[550] text-fg">
          {card.earnType === "stamps" ? t("sf.card.goalStamps") : t("sf.card.goalPoints", { unit })}
        </label>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={t("sf.card.less")} onClick={() => setGoal(card.goal - card.step)} disabled={card.goal <= card.min} className="grid size-12 place-items-center rounded-full border border-border bg-card text-fg hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-40">
            <Minus aria-hidden className="size-5" />
          </button>
          <input
            id="sf-goal"
            name="goal"
            inputMode="numeric"
            dir="ltr"
            value={goalText}
            aria-invalid={errors.goal ? true : undefined}
            aria-describedby={errors.goal ? "sf-goal-error" : "sf-goal-hint"}
            onChange={(e) => {
              const s = e.target.value.replace(/\D/g, "").slice(0, 6);
              setGoalText(s);
              const n = Number(s);
              if (s && n >= card.min && n <= card.max) set({ goal: n });
            }}
            onBlur={() => goalText && setGoal(Number(goalText))}
            className="h-12 w-24 rounded-r3 border border-border bg-card text-center text-title font-[650] tabular-nums text-fg outline-none focus:border-fg focus:ring-1 focus:ring-fg aria-[invalid=true]:border-negative"
          />
          <button type="button" aria-label={t("sf.card.more")} onClick={() => setGoal(card.goal + card.step)} disabled={card.goal >= card.max} className="grid size-12 place-items-center rounded-full border border-border bg-card text-fg hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-40">
            <Plus aria-hidden className="size-5" />
          </button>
        </div>
        {errors.goal ? (
          <p id="sf-goal-error" className="text-meta font-medium text-negative">
            {errors.goal}
          </p>
        ) : (
          <p id="sf-goal-hint" className="text-meta text-fg-muted">
            {earn}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <TextField name="reward" label={t("sf.card.reward")} hint={t("sf.card.rewardHint")} value={card.reward} maxLength={120} onChange={(e) => set({ reward: e.target.value })} error={errors.reward} />
        {card.suggestions.length > 1 || changed ? (
          <div className="flex flex-wrap gap-2">
            {[...new Set([card.defaults.reward, ...card.suggestions])].filter(Boolean).map((s) => (
              <button key={s} type="button" onClick={() => set({ reward: s })} aria-pressed={card.reward === s} className={cn("h-11 rounded-full border px-4 text-meta font-[550] focus-visible:focus-ring", card.reward === s ? "border-fg bg-fg text-bg" : "border-border bg-card text-fg hover:bg-bg-subtle")}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {draft.vertical === "pharmacy" ? <p className="rounded-r4 bg-bg-subtle px-4 py-3 text-meta text-fg">{t("sf.card.pharmacy")}</p> : null}
      <p className="text-meta text-fg-muted">{t("sf.card.later")}</p>
    </StepFrame>
  );
}

"use client";
/**
 * Shared bits for the restaurant ops pages (tiffin, catering, banquet): dates as plain
 * YYYY-MM-DD in America/Toronto, dollars <-> cents, the tier teaser for a 402, a loader
 * that renders skeleton / error / data, and a few small form controls.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import type { tiffinApi } from "@ll/shared";
import { RESTAURANT_PLANS, FEATURES, type FeatureKey } from "@ll/shared";
import { ErrorLine, SkeletonRows } from "@/components/dashboard/kit";
import { NoAccess } from "@/components/dashboard/PageStates";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { ApiState } from "@/lib/dashboard/useApi";

/* ------------------------------------------------------------------ dates */

const TZ = "America/Toronto";
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Today as YYYY-MM-DD in Toronto. */
export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function addDaysISO(d: string, n: number): string {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}
export function dowOf(d: string): number {
  return utc(d).getUTCDay();
}
/** Monday of the week containing `d`. */
export function weekStartISO(d: string): string {
  return addDaysISO(d, -((dowOf(d) + 6) % 7));
}
export function monthStartISO(d: string): string {
  return `${d.slice(0, 7)}-01`;
}
export function addMonthsISO(d: string, n: number): string {
  const x = utc(monthStartISO(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return iso(x);
}
export function monthEndISO(d: string): string {
  return addDaysISO(addMonthsISO(d, 1), -1);
}
export function monthLabel(d: string): string {
  return utc(d).toLocaleDateString("en-CA", { timeZone: "UTC", month: "long", year: "numeric" });
}
/** "Thu, Oct 22" for a plain date. */
export function dayLabel(d: string): string {
  return formatDate(`${d}T12:00:00Z`, true);
}
export function dayShort(d: string): string {
  return formatDate(`${d}T12:00:00Z`);
}
/** Mon..Sun grid for a month (full weeks), as YYYY-MM-DD. */
export function monthGrid(d: string): string[] {
  const first = monthStartISO(d);
  const start = weekStartISO(first);
  const end = monthEndISO(d);
  const out: string[] = [];
  for (let x = start; x <= addDaysISO(weekStartISO(end), 6); x = addDaysISO(x, 1)) out.push(x);
  return out;
}
/** A Toronto-local YYYY-MM-DD + HH:MM as an ISO instant. */
export function torontoInstant(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  for (const off of [4, 5]) {
    const cand = new Date(guess.getTime() + off * 3_600_000);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(cand);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (`${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}` === `${date}T${time}`) return cand.toISOString();
  }
  return new Date(guess.getTime() + 5 * 3_600_000).toISOString();
}
/** Toronto calendar day (YYYY-MM-DD) of an instant. */
export function torontoDay(isoInstant: string): string {
  return todayISO(new Date(isoInstant));
}
export function torontoHM(isoInstant: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(isoInstant));
}

/* ------------------------------------------------------------------ money */

export function centsToField(c: number | null | undefined): string {
  return c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, "");
}
export function fieldToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const bpsToPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

export function MoneyField({ label, value, onChange, hint, error, optionalLabel }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; error?: string | null; optionalLabel?: boolean }) {
  return <TextField label={label} prefix="$" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} hint={hint} error={error} optionalLabel={optionalLabel} />;
}

export function NumberField({ label, value, onChange, hint, error, suffix }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; error?: string | null; suffix?: string }) {
  return <TextField label={label} suffix={suffix} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} hint={hint} error={error} />;
}

/* ------------------------------------------------------------- small UI */

/** A row of toggle capsules (days of the week, dietary tags). Multi-select; each is a real button with aria-pressed. */
export function ToggleChips<T extends string | number>({ options, value, onChange, label, className }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn("inline-flex h-9 min-w-11 items-center justify-center rounded-full border px-3 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg bg-fg font-medium text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Label over a group of controls (for things that are not one input). */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="text-meta-strong text-fg">{children}</p>;
}

/** Two-up grid on tablets and up, stacked on phones. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-3", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
}

/** Hairline row inside a sheet or panel: label left, controls right; wraps on phones. */
export function Line({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0", className)}>{children}</div>;
}

/** Previous / next with the date between, for day and week views. `step` is days (1, 7). */
export function DateNav({ value, onChange, step = 1, unit = "day", label, text, showToday = true }: { value: string; onChange: (d: string) => void; step?: number; unit?: "day" | "month"; label: string; text?: string; showToday?: boolean }) {
  const shift = (n: number) => (unit === "month" ? addMonthsISO(value, n) : addDaysISO(value, n));
  const btn = "inline-flex size-8 items-center justify-center rounded-input border border-line bg-bg text-fg hover:bg-bg-subtle focus-visible:focus-ring";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5 print:hidden">
      <button type="button" aria-label="Previous" className={btn} onClick={() => onChange(shift(-step))}>
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <span className="min-w-[8.5rem] px-1 text-center text-meta-strong tabular text-fg">{text ?? dayLabel(value)}</span>
      <button type="button" aria-label="Next" className={btn} onClick={() => onChange(shift(step))}>
        <ChevronRight aria-hidden className="size-4" />
      </button>
      {showToday ? (
        <button type="button" onClick={() => onChange(todayISO())} className="ms-1 inline-flex h-8 items-center rounded-input px-2.5 text-meta font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
          Today
        </button>
      ) : null}
    </div>
  );
}

/** Dietary flags as short words ("Halal", "Veg", "Spice 2") for list lines. */
export function dietaryWords(d: tiffinApi.Dietary | undefined | null): string[] {
  if (!d) return [];
  const out: string[] = [];
  if (d.zabihah) out.push("Zabihah halal");
  else if (d.halal) out.push("Halal");
  if (d.vegan) out.push("Vegan");
  else if (d.vegetarian) out.push("Vegetarian");
  if (d.jain) out.push("Jain");
  if (d.glutenFree) out.push("Gluten-free");
  if (d.spice) out.push(`Spice ${d.spice}`);
  if (d.allergens?.length) out.push(`Contains ${d.allergens.join(", ")}`);
  return out;
}

/* ------------------------------------------------------------ tier gate */

type Tier = keyof typeof RESTAURANT_PLANS;
function tierCopy(key: FeatureKey): { tier: Tier; line: string } {
  const tier = (FEATURES[key].packTier ?? "growth") as Tier;
  const plan = RESTAURANT_PLANS[tier];
  const price = `$${plan.priceCents / 100}/mo`;
  if (key === "restaurant.banquet") return { tier, line: `Banquet halls come with ${plan.name} (${price}), or as the banquet module on ${RESTAURANT_PLANS.growth.name}.` };
  return { tier, line: `${plan.name} (${price}) includes this.` };
}

/** What a shop below the needed restaurant tier sees: the feature in one line and the tier that has it. */
export function TierTeaser({ featureKey, title, what }: { featureKey: FeatureKey; title: string; what: string }) {
  const { base, role } = useMerchant();
  const { line } = tierCopy(featureKey);
  return (
    <div className="max-w-[560px]">
      <h1 className="text-title text-fg">{title}</h1>
      <p className="mt-1 text-body text-fg-muted">{what}</p>
      <p className="mt-3 text-meta text-fg">{line}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {role === "owner" ? (
          <a href={`${base}/billing`} className="inline-flex h-9 items-center rounded-input bg-fg px-3.5 text-meta-strong text-bg hover:bg-brand-hover focus-visible:focus-ring">
            See restaurant plans
          </a>
        ) : (
          <span className="text-meta text-fg-muted">Ask the shop owner to upgrade.</span>
        )}
        <a href={base} className="text-meta text-fg-muted hover:text-fg">
          Back to home
        </a>
      </div>
    </div>
  );
}

/** Page gate: the page renders only when the shop's tier has the feature, else the tier teaser. */
export function TierGate({ featureKey, title, what, children }: { featureKey: FeatureKey; title: string; what: string; children: ReactNode }) {
  const { enabled } = useMerchant();
  if (!enabled(featureKey)) return <TierTeaser featureKey={featureKey} title={title} what={what} />;
  return <>{children}</>;
}

/**
 * Renders one API state: skeleton while loading, the teaser on 402 (the shop lost the feature
 * since the page loaded), an error line with retry, otherwise the data.
 */
export function Loader<T>({ state, children, rows = 4, gate }: { state: ApiState<T>; children: (d: T) => ReactNode; rows?: number; gate?: { featureKey: FeatureKey; title: string; what: string } }) {
  if (state.status === 402 && gate) return <TierTeaser {...gate} />;
  if (state.status === 403) return <NoAccess title="This part is for owners and managers" body="Ask the shop owner if you need to see it." />;
  if (state.error && !state.data) return <ErrorLine message={state.error} onRetry={() => void state.reload()} />;
  if (!state.data) return <SkeletonRows rows={rows} />;
  return <>{children(state.data)}</>;
}

/* ------------------------------------------------------------- tab state */

/** Tab id kept in `?tab=` so a refresh or a shared link lands on the same view. */
export function useTabParam<T extends string>(ids: readonly T[], fallback: T): [T, (t: T) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = sp.get("tab");
  const tab = (ids as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  const set = useCallback(
    (t: T) => {
      const next = new URLSearchParams(sp.toString());
      next.set("tab", t);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );
  return [tab, set];
}

/** Copy text to the clipboard; resolves false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

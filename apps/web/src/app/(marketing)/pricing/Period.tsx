"use client";
import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type Period = "month" | "year";

/** `moved` turns true at the first change: nothing animates on the first paint. */
const Ctx = createContext<{ period: Period; moved: boolean; set: (p: Period) => void }>({ period: "month", moved: false, set: () => undefined });

/** Holds the billing period the plan cards show. `initial` comes from `?billing=year`, so a yearly link opens on yearly. */
export function PeriodProvider({ initial = "month", children }: { initial?: Period; children: ReactNode }) {
  const [period, setPeriod] = useState<Period>(initial);
  const [moved, setMoved] = useState(false);
  const set = (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setMoved(true);
    // Keep the choice in the address (a refresh or a shared link shows the same prices) without a navigation.
    try {
      const u = new URL(window.location.href);
      if (p === "year") u.searchParams.set("billing", "year");
      else u.searchParams.delete("billing");
      window.history.replaceState(window.history.state, "", u);
    } catch {
      /* the address is a nicety */
    }
  };
  return <Ctx.Provider value={{ period, moved, set }}>{children}</Ctx.Provider>;
}

/**
 * Monthly or yearly: two radios on a track, with a thumb that slides between them (transform only). 44 px tall, the arrow keys move
 * the choice like a native radio group, and the pressed segment dips at once.
 */
export function PeriodToggle({ label, monthly, yearly, save }: { label: string; monthly: string; yearly: string; save: string }) {
  const { period, set } = useContext(Ctx);
  const year = period === "year";
  const seg =
    "press relative z-10 inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full px-4 text-body-strong outline-none [--press-scale:0.97] focus-visible:focus-ring after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']";
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = year ? "month" : "year";
    set(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`button[data-period=${next}]`)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className="relative inline-grid h-11 grid-cols-2 rounded-full bg-muted p-0.5 shadow-[inset_0_0_0_1px_var(--border)]"
      data-testid="period-toggle"
      data-period={period}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0.5 start-0.5 w-[calc(50%-2px)] rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-out",
          year ? "translate-x-full rtl:-translate-x-full" : "translate-x-0",
        )}
      />
      <button type="button" role="radio" aria-checked={!year} tabIndex={year ? -1 : 0} data-period="month" onClick={() => set("month")} className={cn(seg, year ? "text-muted-foreground hover:text-foreground" : "text-foreground")}>
        {monthly}
      </button>
      <button type="button" role="radio" aria-checked={year} tabIndex={year ? 0 : -1} data-period="year" onClick={() => set("year")} className={cn(seg, year ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
        {yearly}
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-success-text">{save}</span>
      </button>
    </div>
  );
}

const money = { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0 } as const;

/**
 * A paid plan's price for the chosen period. The digits roll (AnimatedNumber; no roll under reduced motion), the label beside them and
 * the line under them rise in. Monthly is what the server sends, so the page reads the same with no script.
 * Yearly Pro with the first-year price reads as the list price struck through, the first-year price, then "first year"; it is never named.
 */
export function PlanPrice({
  monthCents,
  yearCents,
  firstYearCents,
  perMonth,
  perYear,
  firstYear,
  monthLine,
  yearLine,
}: {
  monthCents: number;
  yearCents: number;
  /** The first-year price of the yearly plan, when it is on offer and under the list price. */
  firstYearCents?: number | null;
  perMonth: string;
  perYear: string;
  /** "first year" */
  firstYear: string;
  /** Under the monthly price: the yearly price, as the server renders it. */
  monthLine: ReactNode;
  /** Under the yearly price: "or $29 a month". */
  yearLine: string;
}) {
  const { period, moved } = useContext(Ctx);
  const year = period === "year";
  const rise = moved ? "animate-rise-in" : undefined;
  const deal = year && firstYearCents != null && firstYearCents < yearCents;
  const cents = year ? (deal ? firstYearCents! : yearCents) : monthCents;
  return (
    <>
      <p className="mt-6 flex flex-wrap items-baseline gap-x-2" data-testid="plan-price" data-period={period}>
        {deal ? (
          <span className={cn(rise, "text-title text-muted-foreground")}>
            <span className="sr-only">regular price </span>
            <s className="tabular-nums">{`$${Math.round(yearCents / 100)}`}</s>
            <span className="sr-only">, now</span>
          </span>
        ) : null}
        <span className="display text-mkt-lg tabular-nums text-foreground">
          <AnimatedNumber value={cents / 100} format={money} countUp={false} />
        </span>
        <span key={deal ? "fy" : period} className={cn(rise, "text-body text-muted-foreground")}>
          {deal ? firstYear : year ? perYear : perMonth}
        </span>
      </p>
      {/* One height for both periods (the first-year pill is the taller line), so the card below never shifts. */}
      <div key={period} className={cn("min-h-9", rise)}>
        {year ? <p className="mt-2 text-meta text-muted-foreground">{yearLine}</p> : monthLine}
      </div>
    </>
  );
}

/** A plan button that carries the chosen period: on yearly it goes to `yearHref` (sign-up then opens the yearly checkout). */
export function PlanButton({ href, yearHref, variant, children }: { href: string; yearHref: string; variant: "primary" | "secondary"; children: ReactNode }) {
  const { period } = useContext(Ctx);
  return (
    <Button href={period === "year" ? yearHref : href} variant={variant} fullWidth size="lg" className="mt-6">
      {children}
    </Button>
  );
}

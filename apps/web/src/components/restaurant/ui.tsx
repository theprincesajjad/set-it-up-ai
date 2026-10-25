"use client";
/** Small shared pieces for the restaurant customer pages (canvas: monochrome, one accent, hairlines, pill buttons). */
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { spiceKey } from "@ll/shared";
import { ShopLogo } from "@/components/ui/ShopTile";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";

/** Lowercase Bricolage heading like the canvas for English; the locale's own face (never lowercased) for hi / ur / pa. */
export function Heading({ children, level = 1, className, plain }: { children: ReactNode; level?: 1 | 2 | 3; className?: string; /** Sentence-case Inter semibold (service-business screens); the default is the lowercase display face. */ plain?: boolean }) {
  const { locale } = useLocaleOrEnglish();
  const Tag = `h${level}` as "h1";
  const size = level === 1 ? "text-large-title" : level === 2 ? "text-title" : "text-headline";
  return <Tag className={cn(size, "text-fg", plain ? "font-semibold" : locale === "en" ? "display lowercase" : "font-bold", className)}>{children}</Tag>;
}

/** Big number in the display face (amounts due). */
export function BigNumber({ children, tone = "fg", className }: { children: ReactNode; tone?: "fg" | "accent" | "muted"; className?: string }) {
  return (
    <div dir="ltr" className={cn("display text-[44px] leading-none tabular-nums rtl:text-end", tone === "accent" ? "text-accent-text" : tone === "muted" ? "text-fg-muted" : "text-fg", className)}>
      {children}
    </div>
  );
}

/** Bidi isolate so "$12.50" and "30%" keep their shape inside right-to-left (Urdu) sentences. */
const isolate = (s: string) => `\u2066${s}\u2069`;

/** `useLocaleOrEnglish()` with amounts and numbers isolated for RTL. */
export function useFmt() {
  const l = useLocaleOrEnglish();
  const rtl = l.dir === "rtl";
  const wrap = (s: string) => (rtl ? isolate(s) : s);
  return { ...l, money: (c: number, cur?: string) => wrap(l.money(c, cur)), moneyExact: (c: number, cur?: string) => wrap(l.moneyExact(c, cur)), number: (n: number) => wrap(l.number(n)), percent: (n: number) => wrap(`${l.number(n)}%`) };
}

export function ShopHead({ shop, kicker, href }: { shop: { name: string; logoUrl?: string | null; brandColor?: string | null }; kicker?: ReactNode; href?: string }) {
  const body = (
    <>
      <ShopLogo shop={{ name: shop.name, vertical: "restaurant", logoUrl: shop.logoUrl ?? null, brandColor: shop.brandColor ?? null }} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-strong text-fg"><bdi>{shop.name}</bdi></p>
        {kicker ? <p className="truncate text-meta text-fg-muted">{kicker}</p> : null}
      </div>
    </>
  );
  const cls = "flex items-center gap-3";
  return href ? (
    <Link href={href} className={cn(cls, "focus-visible:focus-ring rounded-card")}>
      {body}
    </Link>
  ) : (
    <header className={cls}>{body}</header>
  );
}

/** A titled block separated by a hairline, no card-in-card. */
export function Section({ title, children, className, aside, plain }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode; plain?: boolean }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title || aside ? (
        <div className="flex items-baseline justify-between gap-3">
          {title ? <Heading level={3} plain={plain}>{title}</Heading> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label / value rows with hairlines. */
export function FactList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="rounded-card border border-line px-4">
      {rows.map((r, i) => (
        <div key={r.label} className={cn("flex items-start justify-between gap-4 py-3", i > 0 && "border-t border-line")}>
          <dt className="shrink-0 text-meta text-fg-muted">{r.label}</dt>
          <dd className="min-w-0 text-end text-body text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 0-3 chili dots; rendered only for spice 1+. The label names the level for screen readers. */
export function ChiliDots({ level }: { level: number }) {
  const { t } = useLocaleOrEnglish();
  if (!level || level < 1) return null;
  return (
    <span role="img" aria-label={`${t("spice.label")}: ${t(spiceKey(level))}`} title={t(spiceKey(level))} className="inline-flex items-center gap-[3px]">
      {[1, 2, 3].map((i) => (
        <span key={i} aria-hidden className={cn("size-[7px] rounded-full", i <= level ? "bg-fg" : "bg-bg-muted")} />
      ))}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "ink"; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-caption font-semibold", tone === "accent" ? "bg-accent-soft text-accent-text" : tone === "ink" ? "bg-fg text-bg" : "bg-bg-subtle text-fg-muted", className)}>
      {children}
    </span>
  );
}

/** Quantity stepper: 44px round buttons, live region for the value. */
export function Stepper({ value, min = 1, max = 20, onChange, label, format }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string; format?: (n: number) => string }) {
  const { number } = useLocaleOrEnglish();
  const btn = "inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg text-fg transition-colors hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring disabled:text-fg-subtle disabled:hover:bg-bg";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-4">
      <button type="button" className={btn} aria-label={`− ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-headline tabular-nums text-fg">
        {format ? format(value) : number(value)}
      </output>
      <button type="button" className={btn} aria-label={`+ ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** A segmented radio row of big pill choices (fulfilment, payment method). */
export function ChoiceRow<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("h-11 rounded-full px-5 text-body-strong transition-colors focus-visible:focus-ring", o.value === value ? "bg-fg text-bg" : "border border-line bg-bg text-fg hover:bg-bg-subtle")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-meta-strong text-fg">
      {children}
    </p>
  );
}

export function Hairline() {
  return <hr className="border-0 border-t border-line" />;
}

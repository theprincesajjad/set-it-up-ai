"use client";
/**
 * The cards on Today (v3-strategy.md 4.1, Main Street Warm): Needs you, Today's numbers, Visits by hour, Up next, Quick actions. They draw
 * rows that lib/dashboard/today.ts built; they never fetch. White cards with a soft shadow, Fraunces titles, pastel stat tiles with sparklines,
 * a Lucide icon tile and an action pill on every Needs you row, pastel quick-action tiles.
 *
 * Clear (docs/design/v3.2-clear-audit.md 2.4, the v6 mock): flat white cards (radius 20, hairline drawn as an overlay so it takes no
 * layout space), 56px headers, rows with overlaid dividers (Needs you rows 92, Up next 64), trade-tinted 32px icon tiles (36 on phones),
 * stat cards with an icon tile, the number and a comparison chip (no sparklines), the hour chart with only the current hour in the
 * trade colour, and quick actions as 40px outline buttons (a grouped list on phones). Which one draws is `useThemeStyle().clear` (components/ui/ThemeStyle).
 */
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CalendarX, ChefHat, ChevronRight, ClipboardCheck, Clock, CreditCard, FileText, Gift, Mail, Megaphone, MessageCircle, Phone, PackageCheck, QrCode, ScanLine, ShoppingBag, Upload, User, Users, Wrench, Bell, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { StatBlock, type StatItem } from "@/components/dashboard/kit";
import { useShopVertical } from "@/components/dashboard/useShopVertical";
import { ActionPill } from "@/components/ui/ActionPill";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { IconTile } from "@/components/ui/IconTile";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { TrendBars } from "@/components/ui/TrendBars";
import type { Tone as TileTone } from "@/components/ui/tones";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import type { NeedsRow, QuickAction, UpRow } from "@/lib/dashboard/today";
import { cn } from "@/lib/utils";
import { useThemeStyle } from "@/components/ui/ThemeStyle";
import type { MessageKey } from "@ll/shared";

const MAX_ROWS = 5;
const TONE_WORD = { points: "shell.tone.points", info: "shell.tone.info", warning: "shell.tone.warning", muted: "shell.tone.muted" } as const;

/** Clear: a page card. The hairline is an overlay (inset shadow on ::after) so content sits on the 16px grid and rows can paint to the edge. */
const CLEAR_CARD = "relative rounded-card bg-card shadow-card after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--border)]";
/** Clear: a divider overlaid on the top edge of a row (no layout height); inset 16 at the leading edge on phones (iOS inset grouping). */
const CLEAR_DIVIDER = "relative before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:border-t before:border-border max-lg:before:start-4";
/** Clear: body text, 13/20 (Urdu 28). */
const CLEAR_TEXT = "text-[13px] leading-5 [[lang^=ur]_&]:leading-7";
/** Clear: a 32px trade-tinted icon tile (36 r12 on phones). */
const CLEAR_TILE = "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-trade-tint text-trade lg:size-8 lg:rounded-[10px]";

const ICONS: Record<QuickAction["icon"], LucideIcon> = {
  user: User, megaphone: Megaphone, qr: QrCode, clock: Clock, calendar: CalendarDays, users: Users, mail: Mail, scan: ScanLine, card: CreditCard,
  phone: Phone, chef: ChefHat, upload: Upload, wrench: Wrench, file: FileText, chart: BarChart3,
};
/** Quick-action tiles cycle through these (mint, peach, butter, lilac: the mock's order). */
const ACTION_TONES: TileTone[] = ["mint", "peach", "butter", "lilac", "sky", "rose"];

/** What a Needs you row looks like: its icon, the tile colour and the pill word. Rows are keyed by `key` (class rows by their prefix); the tone is the fallback. */
function needsVisual(r: NeedsRow): { icon: LucideIcon; tone: TileTone; act: MessageKey } {
  const k = r.key;
  if (k === "orders") return { icon: ShoppingBag, tone: "peach", act: "shell.today.actReview" };
  if (k === "rewards") return { icon: Gift, tone: "peach", act: "shell.today.actRemind" };
  if (k === "slipping") return { icon: MessageCircle, tone: "lilac", act: r.href.startsWith("/messages") ? "shell.today.actTextThem" : "shell.today.actView" };
  if (k === "setup") return { icon: ClipboardCheck, tone: "butter", act: "shell.today.actContinue" };
  if (k === "queue" || k === "arrived") return { icon: Users, tone: "mint", act: "shell.today.actOpen" };
  if (k === "late" || k === "overdue") return { icon: Clock, tone: "butter", act: "shell.today.actView" };
  if (k === "needs") return { icon: Wrench, tone: "peach", act: "shell.today.actView" };
  if (k === "quotes") return { icon: FileText, tone: "sky", act: "shell.today.actView" };
  if (k === "ready") return { icon: PackageCheck, tone: "mint", act: "shell.today.actView" };
  if (k.startsWith("full-")) return { icon: Users, tone: "peach", act: "shell.today.actOpen" };
  if (k.startsWith("empty-")) return { icon: CalendarX, tone: "butter", act: "shell.today.actOpen" };
  const tone: TileTone = r.tone === "points" ? "peach" : r.tone === "info" ? "sky" : r.tone === "warning" ? "butter" : "mint";
  return { icon: Bell, tone, act: "shell.today.actOpen" };
}

/** A white card with a soft shadow and a title row. `right` is a quiet label, a count or a link; `badge` sits right after the title (Clear). */
function Card({ id, title, right, badge, className, children }: { id: string; title: string; right?: ReactNode; badge?: ReactNode; className?: string; children: ReactNode }) {
  const hid = useId();
  const clear = useThemeStyle().clear;
  if (clear) {
    return (
      <section id={id} aria-labelledby={hid} className={cn("flex min-w-0 scroll-mt-20 flex-col", CLEAR_CARD, className)}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={hid} className="font-sans text-[14px] font-[650] leading-5 tracking-[-0.011em] text-foreground [[lang^=ur]_&]:leading-7 [[lang^=ur]_&]:tracking-normal">{title}</h2>
            {badge}
          </div>
          {right ? <div className={cn("flex shrink-0 items-center gap-2 text-muted-foreground", CLEAR_TEXT)}>{right}</div> : null}
        </div>
        {children}
      </section>
    );
  }
  return (
    <section id={id} aria-labelledby={hid} className={cn("flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-card bg-card shadow-card", className)}>
      <div className="flex min-h-16 items-center justify-between gap-3 px-5 pt-1">
        <h2 id={hid} className="text-headline text-foreground">{title}</h2>
        {right || badge ? <div className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">{right}{badge}</div> : null}
      </div>
      {children}
    </section>
  );
}

function RowSkeleton({ rows = 3, rowClass }: { rows?: number; rowClass?: string }) {
  if (useThemeStyle().clear) {
    return (
      <div aria-hidden className="flex flex-1 flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cn("flex min-h-16 flex-1 items-center gap-3 px-4", CLEAR_DIVIDER, rowClass)}>
            <span className="skeleton size-9 rounded-xl lg:size-8 lg:rounded-[10px]" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="skeleton h-4 w-2/3 rounded-sm" />
              <span className="skeleton h-3 w-1/2 rounded-sm" />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-17 items-center gap-3 border-t border-border px-5">
          <span className="skeleton size-10 rounded-[14px]" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="skeleton h-4 w-2/3 rounded-sm" />
            <span className="skeleton h-3 w-1/2 rounded-sm" />
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  if (useThemeStyle().clear) return <p className={cn("px-4 py-3 text-muted-foreground", CLEAR_DIVIDER, CLEAR_TEXT)}>{children}</p>;
  return <p className="border-t border-border px-5 py-5 text-body text-muted-foreground">{children}</p>;
}

export function NeedsYouCard({ rows, loading, base, className }: { rows: NeedsRow[]; loading?: boolean; base: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const [all, setAll] = useState(false);
  const vertical = useShopVertical();
  const clear = useThemeStyle().clear;
  const shown = all ? rows : rows.slice(0, MAX_ROWS);
  const count = !loading && rows.length > 0 ? rows.length : 0;
  return (
    <Card
      id="needs-you"
      title={t("shell.today.needsYou")}
      className={className}
      badge={
        count ? (
          clear ? (
            <span aria-hidden className="inline-flex h-5 items-center rounded-lg bg-muted px-2 text-xs font-[550] leading-4 tabular-nums text-foreground">{count}</span>
          ) : (
            <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-meta-strong tabular-nums text-primary-foreground">{count}</span>
          )
        ) : null
      }
      right={
        rows.length > MAX_ROWS ? (
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-foreground focus-visible:focus-ring">
            {all ? t("shell.today.showFewer") : t("shell.today.viewAll", { n: rows.length })}
          </button>
        ) : null
      }
    >
      {loading ? (
        <RowSkeleton rowClass="lg:min-h-[92px]" />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingNeedsYou")}</Empty>
      ) : clear ? (
        <ul className="flex flex-1 flex-col">
          {shown.map((r) => {
            const v = needsVisual(r);
            return (
              <li key={r.key} className={cn("flex min-h-[92px] flex-1 [[lang^=ur]_&]:min-h-24", CLEAR_DIVIDER)}>
                <Link href={`${base}${r.href}`} className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-hover focus-visible:focus-ring [[lang^=ur]_&]:py-2.5">
                  <span aria-hidden className={CLEAR_TILE}>
                    <v.icon className="size-4" strokeWidth={1.8} />
                  </span>
                  <span className={cn("min-w-0 flex-1", CLEAR_TEXT)}>
                    <span className="sr-only">{t(TONE_WORD[r.tone])}: </span>
                    <span className="block font-[650] tracking-[-0.008em] text-foreground">{r.title}</span>
                    {r.sub ? <span className="block text-muted-foreground">{r.sub}</span> : null}
                  </span>
                  {r.age ? <span className={cn("shrink-0 tabular-nums text-muted-foreground max-sm:hidden", CLEAR_TEXT)}>{r.age}</span> : null}
                  <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-[550] text-foreground glass-lite bg-lg-seg-track!">{t(v.act)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-1 flex-col">
          {shown.map((r) => {
            const v = needsVisual(r);
            return (
              <li key={r.key} className="flex max-h-28 flex-1 border-t border-border">
                <Link href={`${base}${r.href}`} className="flex min-h-17 w-full items-center gap-3 px-5 py-3 transition-colors hover:bg-muted focus-visible:focus-ring">
                  <IconTile icon={v.icon} tone={v.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{t(TONE_WORD[r.tone])}: </span>
                    <span className="block text-body-strong text-foreground">{r.title}</span>
                    {r.sub ? <span className="mt-0.5 block text-meta text-muted-foreground">{r.sub}</span> : null}
                  </span>
                  {r.age ? <span className="shrink-0 text-meta tabular-nums text-muted-foreground max-sm:hidden">{r.age}</span> : null}
                  <ActionPill decorative>{t(v.act)}</ActionPill>
                </Link>
              </li>
            );
          })}
          {shown.length < 3 ? (
            <li aria-hidden className="mt-auto flex items-end justify-end px-5 pb-4 pt-2">
              <span className="inline-flex size-16 items-center justify-center rounded-tile bg-trade-soft">
                <CategoryIcon vertical={vertical} size={44} />
              </span>
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

/**
 * Today's numbers. Warm: pastel tiles, the first in the shop's trade colour, then mint, butter, lilac; `items[i].spark` draws the sparkline.
 * Clear: four flat stat cards (278 x 144 at 1440, 171 x 172 on phones): a trade-tinted icon tile (`icons[i]`), the label, the number and a
 * chip with the comparison or the caption. No sparklines.
 */
export function NumbersCard({ items, loading, icons, className }: { items: StatItem[]; loading?: boolean; icons?: LucideIcon[]; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const clear = useThemeStyle().clear;
  if (!clear) return <StatBlock tiles label={t("shell.today.numbers")} items={items} loading={loading} className={className} />;
  return (
    <div role="group" aria-label={t("shell.today.numbers")} className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {items.map((s, i) => (
        <ClearStat key={s.label} item={s} icon={icons?.[i] ?? Users} loading={loading} />
      ))}
    </div>
  );
}

function ClearStat({ item: s, icon: Icon, loading }: { item: StatItem; icon: LucideIcon; loading?: boolean }) {
  const d = s.delta;
  const chipTone = d ? (d.good === true ? "bg-success-soft text-success-text" : d.good === false ? "bg-destructive-soft text-destructive-text" : "bg-muted text-foreground") : "bg-muted text-foreground";
  const Arrow = d?.good === true ? ArrowUpRight : d?.good === false ? ArrowDownRight : null;
  const chip = d ? (
    <>
      {Arrow ? <Arrow aria-hidden className="size-3 shrink-0 rtl:-scale-x-100" strokeWidth={2.4} /> : null}
      <span className="truncate">
        {d.text}
        {d.context ? <span className="max-lg:hidden"> {d.context}</span> : null}
      </span>
    </>
  ) : s.caption ? (
    <span className="truncate">{s.caption}</span>
  ) : null;
  const label = s.href ? (
    <Link href={s.href} className="after:absolute after:inset-0 after:z-[2] after:rounded-[inherit] focus-visible:focus-ring">{s.label}</Link>
  ) : (
    s.label
  );
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 p-4", CLEAR_CARD, s.href && "transition-colors hover:bg-hover")}>
      <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center">
        <span aria-hidden className={CLEAR_TILE}>
          <Icon className="size-4.5 lg:size-4" strokeWidth={1.8} />
        </span>
        <span className={cn("min-w-0 font-[550] text-muted-foreground", CLEAR_TEXT)}>{label}</span>
      </div>
      <div className="-mt-1 text-[32px] font-[650] leading-9 tracking-[-0.032em] tabular-nums text-foreground lg:mt-0 lg:text-4xl lg:leading-10">
        {loading ? <span className="skeleton inline-block h-8 w-16 rounded-sm align-middle" /> : s.value}
      </div>
      {chip && !loading ? (
        <span className={cn("inline-flex h-6 max-w-full items-center gap-1 self-start whitespace-nowrap rounded-xl px-2 text-xs font-[600] leading-4", chipTone)}>{chip}</span>
      ) : (
        <span aria-hidden className="h-6" />
      )}
    </div>
  );
}

/**
 * Visits by hour (7 am to 6 pm in the shop's clock). Warm: highlight bars, the busiest hour is the accent. Clear: grey bars with only the
 * current hour (`currentHour`, the busiest hour when the shop is closed) in the trade colour, a hairline baseline and a three-label axis.
 */
export function HoursCard({ hourly, loading, currentHour, className }: { hourly: { hours: number[]; today: number[] } | null | undefined; loading?: boolean; currentHour?: number; className?: string }) {
  const { t, date } = useLocaleOrEnglish();
  const clear = useThemeStyle().clear;
  const hour = (h: number) => date(new Date(Date.UTC(2000, 0, 1, h)), { hour: "numeric" }, "UTC");
  const values = hourly?.today ?? [];
  const total = values.reduce((a, b) => a + b, 0);
  const peakAt = total > 0 ? values.indexOf(Math.max(...values)) : -1;
  const peak = peakAt >= 0 ? hour(hourly!.hours[peakAt]!) : null;
  if (clear) {
    const nowAt = currentHour == null || !hourly ? -1 : hourly.hours.indexOf(currentHour);
    const hi = nowAt >= 0 ? nowAt : peakAt;
    const max = Math.max(...values, 1);
    return (
      <Card id="visits-by-hour" title={t("shell.today.byHour")} right={t("shell.today.title")} className={className}>
        {loading || !hourly ? (
          <div aria-hidden className="px-4 pb-3 pt-2"><div className="skeleton h-32 w-full rounded-xl" /></div>
        ) : total === 0 ? (
          <p className={cn("px-4 pb-4 text-muted-foreground", CLEAR_TEXT)}>{t("shell.today.byHourEmpty")}</p>
        ) : (
          <figure role="img" aria-label={t("shell.today.byHourSummary", { time: peak ?? "" })} className="m-0">
            <div className="relative flex h-26 items-end gap-1.5 px-4 pt-2 before:absolute before:inset-x-4 before:bottom-0 before:border-t before:border-border">
              {values.map((v, i) => (
                // The current hour keeps an 8px stub even at 0, so "now" is always marked in the trade colour (the other bars stay 2px at 0).
                <span key={i} className={cn("block flex-1 rounded-t-[3px]", i === hi ? "min-h-2 bg-chart-hi" : "min-h-0.5 bg-chart-muted")} style={{ height: `${(v / max) * 100}%` }} />
              ))}
            </div>
            <figcaption aria-hidden className="flex justify-between px-4 pb-3 pt-2 text-xs leading-4 text-muted-foreground">
              <span>{hour(hourly.hours[0]!)}</span>
              <span className="font-[650] text-foreground">{peak ? t("shell.today.peakAt", { time: peak }) : null}</span>
              <span>{hour(hourly.hours[hourly.hours.length - 1]!)}</span>
            </figcaption>
          </figure>
        )}
      </Card>
    );
  }
  return (
    <Card id="visits-by-hour" title={t("shell.today.byHour")} right={t("shell.today.title")} className={className}>
      <div className="px-5 pb-5">
        {loading || !hourly ? (
          <div aria-hidden className="skeleton h-24 w-full rounded-xl" />
        ) : total === 0 ? (
          <p className="py-6 text-body text-muted-foreground">{t("shell.today.byHourEmpty")}</p>
        ) : (
          <TrendBars
            values={values}
            highlight={peakAt}
            label={t("shell.today.byHourSummary", { time: peak ?? "" })}
            labels={[hour(hourly.hours[0]!), peak ? t("shell.today.peakAt", { time: peak }) : undefined, hour(hourly.hours[hourly.hours.length - 1]!)]}
          />
        )}
      </div>
    </Card>
  );
}

export function UpNextCard({ rows, loading, base, label, className }: { rows: UpRow[]; loading?: boolean; base: string; label: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const clear = useThemeStyle().clear;
  return (
    <Card id="up-next" title={t("shell.today.upNext")} right={label} className={className}>
      {loading ? (
        <RowSkeleton rows={clear ? 1 : 2} />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingUpNext")}</Empty>
      ) : clear ? (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const body = (
              <>
                <span dir="ltr" className={cn("w-16 shrink-0 whitespace-nowrap tabular-nums text-muted-foreground", CLEAR_TEXT)}>{r.time}</span>
                <span className={cn("min-w-0 flex-1", CLEAR_TEXT)}>
                  <span className="block font-[650] tracking-[-0.008em] text-foreground">{r.title}</span>
                  {r.sub ? <span className="block text-muted-foreground">{r.sub}</span> : null}
                </span>
              </>
            );
            const cls = "flex min-h-16 items-center gap-3 px-4 py-3 [[lang^=ur]_&]:py-2.5";
            return (
              <li key={r.key} className={CLEAR_DIVIDER}>
                {r.href ? <Link href={`${base}${r.href}`} className={cn(cls, "transition-colors hover:bg-hover focus-visible:focus-ring")}>{body}</Link> : <div className={cls}>{body}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {rows.map((r) => {
            const body = (
              <>
                <span dir="ltr" className="min-w-14 shrink-0 whitespace-nowrap text-meta-strong tabular-nums text-foreground">{r.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-foreground">{r.title}</span>
                  {r.sub ? <span className="mt-0.5 block text-meta text-muted-foreground">{r.sub}</span> : null}
                </span>
              </>
            );
            const cls = "flex min-h-15 items-start gap-3 rounded-2xl bg-hover px-4 py-3";
            return (
              <li key={r.key}>
                {r.href ? <Link href={`${base}${r.href}`} className={cn(cls, "transition-[filter] hover:brightness-[0.97] focus-visible:focus-ring")}>{body}</Link> : <div className={cls}>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Quick actions. Warm: pastel tiles. Clear: four 40px outline buttons in a row (desktop); a grouped list with chevrons on phones. */
export function QuickActionsCard({ actions, base, className }: { actions: QuickAction[]; base: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const clear = useThemeStyle().clear;
  if (actions.length === 0) return null;
  if (clear) {
    return (
      <Card id="quick-actions" title={t("shell.today.quickActions")} className={className}>
        <ul className="flex flex-col lg:grid lg:grid-cols-4 lg:gap-2 lg:px-4 lg:pb-4">
          {actions.map((a) => {
            const Icon = ICONS[a.icon];
            return (
              <li key={a.key} className={cn("max-lg:relative max-lg:before:pointer-events-none max-lg:before:absolute max-lg:before:inset-x-0 max-lg:before:start-4 max-lg:before:top-0 max-lg:before:border-t max-lg:before:border-border")}>
                <Link
                  href={`${base}${a.href}`}
                  className={cn(
                    "flex min-h-11 items-center gap-3 px-4 py-3 font-[550] text-foreground transition-colors hover:bg-hover focus-visible:focus-ring max-lg:[[lang^=ur]_&]:py-2.5",
                    "lg:h-10 lg:min-h-0 lg:rounded-xl lg:border lg:border-border-strong lg:bg-card lg:py-0 lg:shadow-card",
                    CLEAR_TEXT,
                  )}
                >
                  <span aria-hidden className="grid w-9 shrink-0 place-items-center text-muted-foreground lg:w-auto">
                    <Icon className="size-4.5 lg:size-4" strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100 lg:hidden" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }
  return (
    <Card id="quick-actions" title={t("shell.today.quickActions")} className={className}>
      <ul className="grid grid-cols-2 gap-3 px-4 pb-5 lg:grid-cols-4">
        {actions.map((a, i) => (
          <li key={a.key}>
            <QuickActionTile href={`${base}${a.href}`} icon={ICONS[a.icon]} label={a.label} tone={ACTION_TONES[i % ACTION_TONES.length]} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

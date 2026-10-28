"use client";
/**
 * The cards on Today (v3-strategy.md 4.1, Main Street Warm): Needs you, Today's numbers, Visits by hour, Up next, Quick actions. They draw
 * rows that lib/dashboard/today.ts built; they never fetch. White cards with a soft shadow, Fraunces titles, pastel stat tiles with sparklines,
 * a Lucide icon tile and an action pill on every Needs you row, pastel quick-action tiles.
 */
import {
  BarChart3, CalendarDays, CalendarX, ChefHat, ClipboardCheck, Clock, CreditCard, FileText, Gift, Mail, Megaphone, MessageCircle, Phone, PackageCheck, QrCode, ScanLine, ShoppingBag, Upload, User, Users, Wrench, Bell, type LucideIcon,
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
import type { MessageKey } from "@ll/shared";

const MAX_ROWS = 5;
const TONE_WORD = { points: "shell.tone.points", info: "shell.tone.info", warning: "shell.tone.warning", muted: "shell.tone.muted" } as const;

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

/** A white card with a soft shadow and a title row. `right` is a quiet label, a count or a link. */
function Card({ id, title, right, className, children }: { id: string; title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className={cn("flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-card bg-card shadow-card", className)}>
      <div className="flex min-h-16 items-center justify-between gap-3 px-5 pt-1">
        <h2 id={hid} className="text-headline text-foreground">{title}</h2>
        {right ? <div className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function RowSkeleton({ rows = 3 }: { rows?: number }) {
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

const Empty = ({ children }: { children: ReactNode }) => <p className="border-t border-border px-5 py-5 text-body text-muted-foreground">{children}</p>;

export function NeedsYouCard({ rows, loading, base, className }: { rows: NeedsRow[]; loading?: boolean; base: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const [all, setAll] = useState(false);
  const vertical = useShopVertical();
  const shown = all ? rows : rows.slice(0, MAX_ROWS);
  return (
    <Card
      id="needs-you"
      title={t("shell.today.needsYou")}
      className={className}
      right={
        <>
          {rows.length > MAX_ROWS ? (
            <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-foreground focus-visible:focus-ring">
              {all ? t("shell.today.showFewer") : t("shell.today.viewAll", { n: rows.length })}
            </button>
          ) : null}
          {!loading && rows.length > 0 ? <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-meta-strong tabular-nums text-primary-foreground">{rows.length}</span> : null}
        </>
      }
    >
      {loading ? (
        <RowSkeleton />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingNeedsYou")}</Empty>
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

/** Today's numbers as pastel tiles: the first in the shop's trade colour, then mint, butter, lilac. `items[i].spark` draws the sparkline. */
export function NumbersCard({ items, loading, className }: { items: StatItem[]; loading?: boolean; className?: string }) {
  const { t } = useLocaleOrEnglish();
  return <StatBlock tiles label={t("shell.today.numbers")} items={items} loading={loading} className={className} />;
}

/** Visits by hour (7 am to 6 pm in the shop's clock) as highlight bars; the busiest hour is the accent. */
export function HoursCard({ hourly, loading, className }: { hourly: { hours: number[]; today: number[] } | null | undefined; loading?: boolean; className?: string }) {
  const { t, date } = useLocaleOrEnglish();
  const hour = (h: number) => date(new Date(Date.UTC(2000, 0, 1, h)), { hour: "numeric" }, "UTC");
  const values = hourly?.today ?? [];
  const total = values.reduce((a, b) => a + b, 0);
  const peakAt = total > 0 ? values.indexOf(Math.max(...values)) : -1;
  const peak = peakAt >= 0 ? hour(hourly!.hours[peakAt]!) : null;
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
  return (
    <Card id="up-next" title={t("shell.today.upNext")} right={label} className={className}>
      {loading ? (
        <RowSkeleton rows={2} />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingUpNext")}</Empty>
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

export function QuickActionsCard({ actions, base, className }: { actions: QuickAction[]; base: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  if (actions.length === 0) return null;
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

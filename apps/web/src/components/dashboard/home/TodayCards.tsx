"use client";
/**
 * The four standard cards on Today (v3-strategy.md 4.1): Needs you, Today's numbers, Up next, Quick actions. They draw rows
 * that lib/dashboard/today.ts built; they never fetch. One hairline-bordered card each, no shadow.
 */
import { BarChart3, CalendarDays, ChefHat, ChevronRight, CreditCard, FileText, Mail, Megaphone, Phone, QrCode, ScanLine, Upload, User, Users, Wrench, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { StatBlock, type StatItem } from "@/components/dashboard/kit";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import type { NeedsRow, QuickAction, Tone, UpRow } from "@/lib/dashboard/today";
import { cn } from "@/lib/utils";

const MAX_ROWS = 5;
const DOT: Record<Tone, string> = { points: "bg-points", info: "bg-info", warning: "bg-warning", muted: "bg-muted-foreground" };
const TONE_WORD = { points: "shell.tone.points", info: "shell.tone.info", warning: "shell.tone.warning", muted: "shell.tone.muted" } as const;

const ICONS: Record<QuickAction["icon"], LucideIcon> = {
  user: User, megaphone: Megaphone, qr: QrCode, clock: Clock, calendar: CalendarDays, users: Users, mail: Mail, scan: ScanLine, card: CreditCard,
  phone: Phone, chef: ChefHat, upload: Upload, wrench: Wrench, file: FileText, chart: BarChart3,
};

/** A hairline card with a 56 px title row. `right` is a quiet label or link. */
function Card({ id, title, right, className, children }: { id: string; title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={hid} className={cn("flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-card border border-border bg-card", className)}>
      <div className="flex min-h-14 items-center justify-between gap-3 px-5">
        <h2 id={hid} className="text-headline text-foreground">{title}</h2>
        {right ? <div className="shrink-0 text-meta text-muted-foreground">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-16.75 items-center gap-3 border-t border-border px-5">
          <span className="skeleton size-2 rounded-full" />
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
  const shown = all ? rows : rows.slice(0, MAX_ROWS);
  return (
    <Card
      id="needs-you"
      title={t("shell.today.needsYou")}
      className={className}
      right={
        rows.length > MAX_ROWS ? (
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-foreground focus-visible:focus-ring">
            {all ? t("shell.today.showFewer") : t("shell.today.viewAll", { n: rows.length })}
          </button>
        ) : null
      }
    >
      {loading ? (
        <RowSkeleton />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingNeedsYou")}</Empty>
      ) : (
        <ul>
          {shown.map((r) => (
            <li key={r.key} className="border-t border-border">
              <Link href={`${base}${r.href}`} className="flex min-h-16.5 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted focus-visible:focus-ring">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[r.tone])} />
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{t(TONE_WORD[r.tone])}: </span>
                  <span className="block text-body-strong text-foreground">{r.title}</span>
                  {r.sub ? <span className="mt-0.5 block text-meta text-muted-foreground">{r.sub}</span> : null}
                </span>
                {r.age ? <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{r.age}</span> : null}
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NumbersCard({ items, loading, className }: { items: StatItem[]; loading?: boolean; className?: string }) {
  const { t } = useLocaleOrEnglish();
  return <StatBlock label={t("shell.today.numbers")} items={items} loading={loading} className={className} />;
}

export function UpNextCard({ rows, loading, base, label, className }: { rows: UpRow[]; loading?: boolean; base: string; label: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  return (
    <Card id="up-next" title={t("shell.today.upNext")} right={label} className={className}>
      {loading ? (
        <RowSkeleton />
      ) : rows.length === 0 ? (
        <Empty>{t("shell.today.nothingUpNext")}</Empty>
      ) : (
        <ul>
          {rows.map((r) => {
            const body = (
              <>
                <span dir="ltr" className="min-w-14 shrink-0 whitespace-nowrap text-meta tabular-nums text-foreground">{r.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-foreground">{r.title}</span>
                  {r.sub ? <span className="mt-0.5 block text-meta text-muted-foreground">{r.sub}</span> : null}
                </span>
              </>
            );
            const cls = "flex min-h-15.5 items-start gap-3 px-5 py-3";
            return (
              <li key={r.key} className="border-t border-border">
                {r.href ? <Link href={`${base}${r.href}`} className={cn(cls, "transition-colors hover:bg-muted focus-visible:focus-ring")}>{body}</Link> : <div className={cls}>{body}</div>}
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
      <ul className="grid grid-cols-2 gap-3 px-4 pb-4 lg:grid-cols-4">
        {actions.map((a) => {
          const Icon = ICONS[a.icon];
          return (
            <li key={a.key}>
              <Link href={`${base}${a.href}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-background px-4 py-2 text-body-strong text-foreground transition-colors hover:bg-muted focus-visible:focus-ring">
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                <span>{a.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

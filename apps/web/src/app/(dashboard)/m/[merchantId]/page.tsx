"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PLANS } from "@ll/shared";
import { cn } from "@/lib/cn";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { Meter, PageHeader, QuietLink, Segmented, SkeletonRows, StatBlock, type StatItem } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { firstName, formatNumber, formatTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { signedPoints, sourceLabel, typeLabel } from "@/lib/dashboard/labels";
import { RANGE_OPTIONS, greeting, longDate, pctDelta, rangeFor, relativeTime, type RangeKey } from "@/lib/dashboard/time";

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

export default function HomePage() {
  const { api, base, detail, role, me, enabled } = useMerchant();
  const manager = role !== "staff";
  const [range, setRange] = useState<RangeKey>("30d");
  const r = rangeFor(range);
  const today = useApi(() => api.counter.today(), [api], { pollMs: 30_000 });
  const onboarding = useApi(manager ? () => api.onboarding() : null, [api, manager]);
  const overview = useApi(manager ? () => api.reports.overview({ from: r.from, to: r.to }) : null, [api, manager, range]);
  const daily = useApi(manager ? () => api.reports.daily({ from: rangeFor(range === "today" ? "7d" : range).from, to: r.to }) : null, [api, manager, range]);
  const advanced = enabled("reports.advanced");
  const overlap = useApi(manager && advanced ? () => api.reports.networkOverlap() : null, [api, manager, advanced]);
  const promosOn = enabled("promos.basic") || enabled("promos.double_points");
  const promos = useApi(manager && promosOn ? () => api.promos("live") : null, [api, manager, promosOn]);
  const activity = useApi(manager ? () => api.activity({ limit: 6 }) : null, [api, manager]);
  const now = useNow();

  const m = detail.merchant;
  const term = detail.program?.terminology;
  const ob = onboarding.data;
  const series = daily.data?.series ?? [];
  const cur = overview.data?.current;
  const prev = overview.data?.previous;
  const delta = (k: "activeMembers" | "visits" | "redemptions" | "newMembers", withContext = false): StatItem["delta"] => {
    if (!cur || !prev) return null;
    const p = pctDelta(cur[k], prev[k]);
    if (p === null) return null;
    return { good: p > 0 ? true : p < 0 ? false : null, text: `${p > 0 ? "+" : ""}${p}%`, context: withContext ? `vs ${r.label.replace(/^previous/, "last")}` : undefined };
  };
  const zero = cur && cur.visits === 0;
  const daysLeft = Math.max(0, 30 - Math.floor((now - new Date(m.createdAt).getTime()) / 86_400_000));
  const upsellKeys = (["promos.basic", "marketing.email", "integrations.pos_auto_award"] as const).filter((k) => !enabled(k));
  const name = me.user.name ? firstName(me.user.name) : null;

  const counterAct = useApi(() => api.counter.activity({ limit: 30 }), [api], { pollMs: 30_000 });
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const todayRows = (counterAct.data?.items ?? []).filter((a) => new Date(a.createdAt).getTime() >= startOfDay && !a.reversed);
  const visitsToday = today.data?.visitCount ?? null;
  const ov = advanced ? overlap.data : null;
  const hoodShort = ov?.neighbourhood?.name.replace(/\s+(Village|BIA)$/i, "") ?? null;

  // canvas Dashboard: one Performance block (four hairline-separated numbers, black bars with today in accent),
  // two hairline lists, and one quiet Plus line.
  return (
    <div className="flex flex-col">
      <PageHeader
        title={name ? `${greeting()}, ${name}` : greeting()}
        description={`${longDate()} · ${visitsToday == null ? m.name : visitsToday === 0 ? "no one at the counter yet today" : `${plural(visitsToday, "customer")} at the counter so far today`}`}
        actions={<Button size="md" href={`${base}/counter`} className="h-[38px] rounded-[10px] px-4 text-[14px] font-medium">Open counter</Button>}
        flush
      />

      {manager ? (
        <section aria-labelledby="perf-h" className="mt-7 overflow-hidden rounded-card border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-5 py-3.5">
            <h2 id="perf-h" className="text-[15px] font-semibold text-fg">
              Performance
            </h2>
            <Segmented label="Range" options={RANGE_OPTIONS.filter((o) => o.value !== "today")} value={range} onChange={setRange} />
          </div>
          <StatBlock
            bare
            loading={overview.loading && !cur}
            items={[
              { label: "Active members", value: cur ? formatNumber(cur.activeMembers) : "–", delta: delta("activeMembers", true), caption: zero ? "First visits show up here" : undefined, href: `${base}/reports` },
              { label: "Visits", value: cur ? formatNumber(cur.visits) : "–", delta: delta("visits"), href: `${base}/reports` },
              { label: "Rewards redeemed", value: cur ? formatNumber(cur.redemptions) : "–", caption: cur && cur.visits > 0 ? `${Math.round((cur.redemptions / cur.visits) * 100)}% of visits` : undefined, href: `${base}/reports` },
              ov && ov.myMembers > 0
                ? { label: "Members who also shop the street", value: `${Math.round(ov.sharedPct)}%`, caption: `${formatNumber(ov.sharedMembers)} of ${formatNumber(ov.myMembers)}`, href: `${base}/reports` }
                : { label: "New members", value: cur ? formatNumber(cur.newMembers) : "–", delta: delta("newMembers"), href: `${base}/customers` },
            ]}
          />
          <div className="border-t border-line px-5 pb-4 pt-[18px]">
            {daily.data ? <DailyBars data={series.map((x) => ({ date: x.date, value: x.visits }))} /> : <div className="skeleton h-[190px] w-full rounded-sm" />}
          </div>
        </section>
      ) : null}

      {ob && !ob.activatedAt && manager ? (
        <div className="mt-8 flex flex-col gap-2 border-y border-line py-3 sm:flex-row sm:items-center sm:gap-6">
          <span className="shrink-0 text-meta text-fg">Your first 25 members</span>
          <Meter className="sm:max-w-[320px]" value={ob.activeMembers} max={ob.activationTarget} label="Active members" />
          <span className="shrink-0 text-meta text-fg-muted tabular">
            {ob.activeMembers} of {ob.activationTarget}
            {daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}
          </span>
          <QuietLink href={`${base}/setup?step=first_members`} className="sm:ms-auto">
            Tips
          </QuietLink>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <CanvasList
          title="Today at the counter"
          right={today.data ? `${plural(today.data.visitCount, "visit")} · ${formatNumber(today.data.newMembers)} new` : null}
          empty={<>No visits yet today. <QuietLink href={`${base}/locations`}>Print your QR stand</QuietLink></>}
          loading={counterAct.loading && !counterAct.data}
          rows={todayRows.slice(0, 4).map((a) => ({
            key: a.transactionId,
            href: manager ? `${base}/customers?member=${a.memberId}` : undefined,
            title: a.name ?? (a.maskedPhone ? `New member · ${a.maskedPhone.replace(/\*/g, "•")}` : "Member"),
            meta: [formatTime(a.createdAt), a.type === "redeem" ? `redeemed ${a.description?.replace(/^Redeemed:?\s*/i, "") || "a reward"}` : a.type === "welcome_bonus" ? "joined from the counter QR" : sourceLabel(a.source).toLowerCase(), a.type !== "redeem" && a.staffName ? firstName(a.staffName) : null].filter(Boolean).join(" · "),
            trailing: signedPoints(a.points, term),
            accent: a.type === "redeem",
          }))}
        />
        {ov && ov.shops.length ? (
          <CanvasList
            title="Your customers also visit"
            right={`${hoodShort ?? "Your street"} · ${ov.windowDays} days`}
            rows={ov.shops.slice(0, 3).map((x) => ({ key: x.merchantId, title: x.name, trailing: `${ov.myMembers ? Math.round((x.sharedMembers / ov.myMembers) * 100) : 0}%`, muted: true }))}
            footnote="Shops see totals only, never each other’s customers."
          />
        ) : manager ? (
          <CanvasList
            title="Recent activity"
            right="Awards, redemptions and adjustments"
            loading={!activity.data}
            empty="Nothing yet. Awards and redemptions show up here."
            rows={(activity.data?.items ?? []).slice(0, 4).map((x) => ({ key: x.id, href: `${base}/customers?member=${x.memberId}`, title: x.customerName ?? "Member", meta: `${typeLabel(x.type)} · ${relativeTime(x.createdAt)}`, trailing: signedPoints(x.points, term), muted: x.points < 0 }))}
          />
        ) : null}
      </div>

      {manager && promosOn ? (
        <div className="mt-8 grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <CanvasList
            title="Live promos"
            right={<QuietLink href={`${base}/promos`}>Promos</QuietLink>}
            loading={!promos.data}
            empty={<>No live promos. <QuietLink href={`${base}/promos/new`}>New promo</QuietLink></>}
            rows={(promos.data?.items ?? []).slice(0, 4).map((p) => ({ key: p.id, href: `${base}/promos/${p.id}`, title: p.title, meta: p.endsAt ? `Until ${new Date(p.endsAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : "No end date" }))}
          />
        </div>
      ) : null}

      {manager && upsellKeys.length === 3 ? (
        <p className="mt-9 border-t border-line pt-4 text-[13px] text-fg-muted">
          More with {PLANS.plus.name}: promos, texts and POS sync · coming soon · <NotifyLink keys={[...upsellKeys]} className="text-[13px] no-underline" />
        </p>
      ) : null}
    </div>
  );
}

/** Canvas list: a title row over a hairline, 12 px rows with a 12 px meta line, numbers right. */
function CanvasList({ title, right, rows, empty, loading, footnote }: { title: string; right?: ReactNode; rows: { key: string; title: ReactNode; meta?: string; trailing?: ReactNode; href?: string; accent?: boolean; muted?: boolean }[]; empty?: ReactNode; loading?: boolean; footnote?: string }) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {right ? <span className="truncate text-[13px] text-fg-muted">{right}</span> : null}
      </div>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <p className="border-b border-line py-3 text-[14px] text-fg-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((r, i) => {
            const inner = (
              <>
                <span className="min-w-0 text-fg">
                  <span className="block truncate">{r.title}</span>
                  {r.meta ? <small className="mt-0.5 block truncate text-[12px] text-fg-muted">{r.meta}</small> : null}
                </span>
                {r.trailing != null ? <span className={cn("shrink-0 tabular", r.accent ? "font-medium text-accent-text" : r.muted ? "text-fg-muted" : "font-medium text-fg")}>{r.trailing}</span> : null}
              </>
            );
            const cls = cn("flex items-center justify-between gap-3 py-3 text-[14px]", i < rows.length - 1 && "border-b border-line");
            return <li key={r.key}>{r.href ? <Link href={r.href} className={cn(cls, "hover:bg-bg-subtle focus-visible:focus-ring")}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
          })}
        </ul>
      )}
      {footnote ? <p className="mt-3 text-[13px] text-fg-muted">{footnote}</p> : null}
    </section>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const [, mo, d] = iso.split("-").map(Number);
  return `${MONTHS[(mo ?? 1) - 1]} ${d}`;
};

/** Visits per day (canvas): black bars, the latest day in accent, a baseline and three date labels. */
function DailyBars({ data }: { data: { date: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const first = data[0]?.date;
  const mid = data[Math.floor((data.length - 1) / 2)]?.date;
  const last = data[data.length - 1]?.date;
  return (
    <figure>
      <figcaption className="text-[13px] text-fg-muted">Visits per day</figcaption>
      <div aria-hidden className="mt-3.5 flex h-[150px] items-end gap-1.5 border-b border-line">
        {data.map((d, i) => (
          <div key={d.date} title={`${shortDate(d.date)}: ${d.value}`} className={cn("flex-1 rounded-t-[3px]", i === data.length - 1 ? "bg-accent" : "bg-fg")} style={{ height: `${Math.round((d.value / max) * 140)}px` }} />
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex justify-between text-[11px] text-fg-subtle">
        <span>{first ? shortDate(first) : ""}</span>
        <span>{mid ? shortDate(mid) : ""}</span>
        <span>{last ? shortDate(last) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>Visits per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{shortDate(d.date)}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

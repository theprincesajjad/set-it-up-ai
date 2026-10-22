"use client";
import { useState } from "react";
import { BarChart, LineChart } from "@/components/dashboard/Charts";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { Empty, Meter, PageHeader, QuietLink, Row, RowList, Section, Segmented, SkeletonRows, StatBlock, type StatItem } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { firstName, formatNumber, formatTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { signedPoints, sourceLabel, typeLabel } from "@/lib/dashboard/labels";
import { RANGE_OPTIONS, greeting, longDate, pctDelta, rangeFor, relativeTime, type RangeKey } from "@/lib/dashboard/time";

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
  const delta = (k: "activeMembers" | "visits" | "redemptions" | "newMembers"): StatItem["delta"] => {
    if (!cur || !prev) return null;
    const p = pctDelta(cur[k], prev[k]);
    if (p === null) return null;
    return { good: p > 0 ? true : p < 0 ? false : null, text: `${p > 0 ? "+" : ""}${p}%`, context: `vs ${r.label}` };
  };
  const zero = cur && cur.visits === 0;
  const daysLeft = Math.max(0, 30 - Math.floor((now - new Date(m.createdAt).getTime()) / 86_400_000));
  const upsellKeys = (["promos.basic", "marketing.email", "integrations.pos_auto_award"] as const).filter((k) => !enabled(k));
  const name = me.user.name ? firstName(me.user.name) : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={name ? `${greeting()}, ${name}` : greeting()}
        description={`${longDate()} · ${m.name}`}
        actions={<Button size="sm" href={`${base}/counter`}>Open counter</Button>}
        flush
      />

      {manager ? (
        <section aria-labelledby="perf-h" className="overflow-hidden rounded-card border border-line">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id="perf-h" className="text-body-strong text-fg">
              Performance
            </h2>
            <Segmented label="Date range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
          </div>
          <StatBlock
            bare
            loading={overview.loading && !cur}
            items={[
              { label: "Active members", value: cur ? formatNumber(cur.activeMembers) : "–", delta: delta("activeMembers"), caption: zero ? "First visits show up here" : undefined, href: `${base}/reports` },
              { label: "Visits", value: cur ? formatNumber(cur.visits) : "–", delta: delta("visits"), href: `${base}/reports` },
              { label: "Rewards redeemed", value: cur ? formatNumber(cur.redemptions) : "–", delta: delta("redemptions"), href: `${base}/reports` },
              { label: "New members", value: cur ? formatNumber(cur.newMembers) : "–", delta: delta("newMembers"), href: `${base}/customers` },
            ]}
          />
          <div className="border-t border-line px-5 pb-5 pt-4">
            {daily.data ? (
              // Sparse daily counts read better as bars; a busy shop gets the calmer line.
              Math.max(0, ...series.map((x) => x.visits)) <= 4 ? (
                <BarChart title="Visits per day" subtitle={range === "today" ? "Last 7 days" : undefined} valueLabel="Visits" data={series.map((s) => ({ label: s.date, value: s.visits }))} height={160} />
              ) : (
                <LineChart title="Visits per day" subtitle={range === "today" ? "Last 7 days" : undefined} valueLabel="Visits" data={series.map((s) => ({ label: s.date, value: s.visits }))} height={160} />
              )
            ) : (
              <div className="skeleton h-[200px] w-full rounded-sm" />
            )}
          </div>
        </section>
      ) : null}

      {ob && !ob.activatedAt && manager ? (
        <div className="flex flex-col gap-2 border-y border-line py-3 sm:flex-row sm:items-center sm:gap-6">
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

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section
          title="Today at the counter"
          description={today.data ? `${formatNumber(today.data.visitCount)} visits · ${formatNumber(today.data.pointsIssued)} given · ${formatNumber(today.data.newMembers)} new` : " "}
          action={<QuietLink href={`${base}/counter`}>Counter</QuietLink>}
        >
          {today.loading && !today.data ? (
            <SkeletonRows rows={5} />
          ) : today.data && today.data.items.length ? (
            <RowList label="Visits today">
              {today.data.items.slice(0, 6).map((v) => (
                <Row key={v.visitId} title={v.name ?? v.maskedPhone ?? "Member"} meta={`${formatTime(v.createdAt)} · ${sourceLabel(v.source)}`} trailing={<span className="text-fg">+{formatNumber(v.points)}</span>} href={manager ? `${base}/customers?member=${v.memberId}` : undefined} />
              ))}
            </RowList>
          ) : (
            <Empty action={<QuietLink href={`${base}/locations`}>Print your QR stand</QuietLink>} className="border-y border-line">
              No visits yet today.
            </Empty>
          )}
        </Section>

        {manager ? (
          <Section title="Recent activity" description="Awards, redemptions and adjustments" action={<QuietLink href={`${base}/customers`}>Customers</QuietLink>}>
            {activity.data ? (
              activity.data.items.length ? (
                <RowList label="Recent activity">
                  {activity.data.items.map((a) => (
                    <Row
                      key={a.id}
                      href={`${base}/customers?member=${a.memberId}`}
                      title={a.customerName ?? "Member"}
                      meta={`${typeLabel(a.type)} · ${relativeTime(a.createdAt)}`}
                      trailing={<span className={a.points >= 0 ? "text-fg" : "text-fg-muted"}>{signedPoints(a.points, term)}</span>}
                    />
                  ))}
                </RowList>
              ) : (
                <Empty className="border-y border-line">Nothing yet. Awards and redemptions show up here.</Empty>
              )
            ) : (
              <SkeletonRows rows={5} />
            )}
          </Section>
        ) : null}
      </div>

      {manager && (promosOn || (advanced && overlap.data)) ? (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
          {promosOn ? (
            <Section title="Live promos" action={<QuietLink href={`${base}/promos`}>Promos</QuietLink>}>
              {promos.data?.items.length ? (
                <RowList label="Live promos">
                  {promos.data.items.slice(0, 4).map((p) => (
                    <Row key={p.id} href={`${base}/promos/${p.id}`} title={p.title} meta={p.endsAt ? `Until ${new Date(p.endsAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : "No end date"} />
                  ))}
                </RowList>
              ) : promos.data ? (
                <Empty className="border-y border-line" action={<QuietLink href={`${base}/promos/new`}>New promo</QuietLink>}>
                  No live promos.
                </Empty>
              ) : (
                <SkeletonRows rows={2} />
              )}
            </Section>
          ) : null}
          {advanced && overlap.data ? (
            <Section title="Your customers also shop at" description={overlap.data.neighbourhood ? `${overlap.data.neighbourhood.name}, last ${overlap.data.windowDays} days` : undefined}>
              <RowList label="Network overlap">
                {overlap.data.shops.slice(0, 4).map((s) => (
                  <Row key={s.merchantId} title={s.name} trailing={<span className="text-fg-muted">{overlap.data!.myMembers ? Math.round((s.sharedMembers / overlap.data!.myMembers) * 100) : 0}%</span>} />
                ))}
              </RowList>
            </Section>
          ) : null}
        </div>
      ) : null}

      {manager && upsellKeys.length === 3 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
          <span className="text-fg">More with Plus</span>
          <span>— promos, marketing, POS sync</span>
          <span aria-hidden>·</span>
          <span>coming soon</span>
          <span aria-hidden>·</span>
          <NotifyLink keys={[...upsellKeys]} />
        </p>
      ) : null}
    </div>
  );
}

"use client";
import { Calculator, Megaphone, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { VERTICAL_TEMPLATES, type FeatureKey } from "@ll/shared";
import { BarChart } from "@/components/dashboard/Charts";
import { ActivationCard, ChecklistCard } from "@/components/dashboard/Checklist";
import { FeatureTeaser } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, ListRow } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
import { PromoCard } from "@/components/ui/PromoCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { firstName, formatNumber, formatTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { signedPoints, sourceLabel, typeLabel } from "@/lib/dashboard/labels";
import { RANGE_OPTIONS, greeting, longDate, pctDelta, rangeFor, relativeTime, type RangeKey } from "@/lib/dashboard/time";

const DISMISS_KEY = "ll.home.teaser.dismissedAt";

export default function HomePage() {
  const { api, base, detail, role, me } = useMerchant();
  const manager = role !== "staff";
  const [range, setRange] = useState<RangeKey>("30d");
  const r = rangeFor(range);
  const today = useApi(() => api.counter.today(), [api], { pollMs: 30_000 });
  const onboarding = useApi(manager ? () => api.onboarding() : null, [api, manager]);
  const overview = useApi(manager ? () => api.reports.overview({ from: r.from, to: r.to }) : null, [api, manager, range]);
  const daily = useApi(manager ? () => api.reports.daily({ from: rangeFor(range === "today" ? "7d" : range).from, to: r.to }) : null, [api, manager, range]);
  const overlap = useApi(manager ? () => api.reports.networkOverlap() : null, [api, manager]);
  const promos = useApi(manager ? () => api.promos("live") : null, [api, manager]);
  const activity = useApi(manager ? () => api.activity({ limit: 6 }) : null, [api, manager]);
  const now = useNow();
  const [teaserHidden, setTeaserHidden] = useState(true);
  useEffect(() => {
    let hidden = false;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      hidden = Date.now() - at < 30 * 86_400_000;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeaserHidden(hidden);
  }, []);

  const m = detail.merchant;
  const ob = onboarding.data;
  const series = daily.data?.series ?? [];
  const cur = overview.data?.current;
  const prev = overview.data?.previous;
  const delta = (k: "activeMembers" | "visits" | "redemptions" | "newMembers") => {
    if (!cur || !prev) return null;
    const p = pctDelta(cur[k], prev[k]);
    return p === null ? null : { pct: p, good: p > 0 ? true : p < 0 ? false : null, text: `${p >= 0 ? "+" : ""}${p}% vs ${r.label}` };
  };
  const zero = cur && cur.visits === 0;
  const upsell: FeatureKey = VERTICAL_TEMPLATES[m.vertical].upsellPlan === "pro" ? "service.tickets" : "orders.order_ahead";
  const justActivated = ob && ob.activatedAt && now - new Date(ob.activatedAt).getTime() < 7 * 86_400_000;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={me.user.name ? `${greeting()}, ${firstName(me.user.name)}` : greeting()}
        description={`${longDate()} · ${m.name}`}
        actions={
          <div className="hidden md:block">
            <Button href={`${base}/counter`} iconStart={Calculator}>
              Open counter
            </Button>
          </div>
        }
      />

      {justActivated ? <Banner tone="success">You hit 25 members. Nice work.</Banner> : null}
      {ob && ob.percentComplete < 100 ? <ChecklistCard checklist={ob} base={base} /> : null}
      {ob && !ob.activatedAt ? <ActivationCard active={ob.activeMembers} target={ob.activationTarget} createdAt={m.createdAt} /> : null}

      {manager ? (
        <section aria-label="Key numbers" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h3 text-fg">How it&apos;s going</h2>
            <SegmentedControl label="Date range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active members" value={cur ? formatNumber(cur.activeMembers) : null} loading={overview.loading && !cur} delta={delta("activeMembers")} caption={zero ? "Your first visits will show up here" : undefined} href={`${base}/reports`} />
            <StatTile label="Visits" value={cur ? formatNumber(cur.visits) : null} loading={overview.loading && !cur} delta={delta("visits")} spark={series.map((s) => s.visits)} href={`${base}/reports`} />
            <StatTile label="Rewards redeemed" value={cur ? formatNumber(cur.redemptions) : null} loading={overview.loading && !cur} delta={delta("redemptions")} href={`${base}/reports`} />
            <StatTile label="New members" value={cur ? formatNumber(cur.newMembers) : null} loading={overview.loading && !cur} delta={delta("newMembers")} spark={series.map((s) => s.newMembers)} href={`${base}/customers`} />
          </div>
          {daily.data ? (
            <BarChart title="Visits per day" subtitle={range === "today" ? "Last 7 days" : RANGE_OPTIONS.find((o) => o.value === range)?.label} valueLabel="Visits" data={series.map((s) => ({ label: s.date.slice(5), value: s.visits }))} />
          ) : (
            <Skeleton className="h-60 w-full rounded-lg" />
          )}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <CardHeader
            title="Today at the counter"
            subtitle={today.data ? `${formatNumber(today.data.visitCount)} visits · ${formatNumber(today.data.pointsIssued)} given · ${formatNumber(today.data.newMembers)} new` : undefined}
            action={
              <Button variant="ghost" size="sm" href={`${base}/counter`}>
                Counter
              </Button>
            }
          />
          {today.loading && !today.data ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : today.data && today.data.items.length ? (
            <ul className="divide-y divide-border">
              {today.data.items.slice(0, 5).map((v) => (
                <li key={v.visitId}>
                  <ListRow leading={<Avatar name={v.name} id={v.memberId} size={40} />} title={v.name ?? v.maskedPhone ?? "Member"} subtitle={`${formatTime(v.createdAt)} · ${sourceLabel(v.source)}`} trailing={<span className="tabular-nums text-fg-brand">+{v.points}</span>} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={QrCode} title="No visits yet today" description="Your QR stand is the fastest way to start." action={<Button variant="tonal" href={`${base}/locations`}>Print your QR stand</Button>} className="py-6" />
          )}
        </Card>

        {manager ? (
          <Card padding="lg">
            <CardHeader title="Your customers also shop at" subtitle={overlap.data?.neighbourhood ? `On ${overlap.data.neighbourhood.name}, last ${overlap.data.windowDays} days` : "The network on your street"} />
            {overlap.data ? (
              overlap.data.shops.length ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {overlap.data.shops.slice(0, 3).map((s) => (
                      <li key={s.merchantId} className="flex items-center justify-between gap-3">
                        <span className="truncate text-body text-fg">{s.name}</span>
                        <span className="shrink-0 tabular-nums text-body-sm text-fg-muted">{overlap.data!.myMembers ? Math.round((s.sharedMembers / overlap.data!.myMembers) * 100) : 0}% overlap</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-body-sm text-fg-muted">
                    {formatNumber(overlap.data.sharedMembers)} of your {formatNumber(overlap.data.myMembers)} members also visit other shops on your street.
                  </p>
                </>
              ) : (
                <p className="text-body-sm text-fg-muted">As your members visit other shops on the street, you&apos;ll see the overlap here. Shops with fewer than 5 shared members stay private.</p>
              )
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </Card>
        ) : null}
      </div>

      {manager ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3" aria-labelledby="live-promos">
            <div className="flex items-center justify-between">
              <h2 id="live-promos" className="text-h3 text-fg">
                Live promos
              </h2>
              <Button variant="tonal" size="sm" iconStart={Megaphone} href={`${base}/promos/new`}>
                New promo
              </Button>
            </div>
            {promos.data?.items.length ? (
              promos.data.items.slice(0, 2).map((p) => <PromoCard key={p.id} promo={p} shop={m} variant="compact" href={`${base}/promos/${p.id}`} />)
            ) : promos.data ? (
              <Card tone="flat">
                <p className="text-body-sm text-fg-muted">No live promos. A simple offer gets people through the door. Try double stamps on a slow afternoon.</p>
              </Card>
            ) : (
              <Skeleton className="h-24 w-full rounded-lg" />
            )}
          </section>
          <section className="flex flex-col gap-3" aria-labelledby="recent-activity">
            <div className="flex items-center justify-between">
              <h2 id="recent-activity" className="text-h3 text-fg">
                Recent activity
              </h2>
              <Button variant="ghost" size="sm" href={`${base}/customers`}>
                See all
              </Button>
            </div>
            <Card padding="sm">
              {activity.data?.items.length ? (
                <ul className="divide-y divide-border">
                  {activity.data.items.map((a) => (
                    <li key={a.id}>
                      <ListRow href={`${base}/customers/${a.memberId}`} title={a.customerName ?? "Member"} subtitle={`${typeLabel(a.type)} · ${relativeTime(a.createdAt)}`} trailing={<span className={a.points >= 0 ? "tabular-nums text-fg-brand" : "tabular-nums text-fg"}>{signedPoints(a.points, detail.program?.terminology)}</span>} />
                    </li>
                  ))}
                </ul>
              ) : activity.data ? (
                <p className="p-2 text-body-sm text-fg-muted">Awards, redemptions and adjustments show up here.</p>
              ) : (
                <Skeleton className="h-24 w-full" />
              )}
            </Card>
          </section>
        </div>
      ) : null}

      {manager && !teaserHidden ? (
        <div className="flex flex-col items-end gap-1">
          <div className="w-full"><FeatureTeaser featureKey={upsell} /></div>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, String(Date.now()));
              } catch {
                /* ignore */
              }
              setTeaserHidden(true);
            }}
            className="min-h-11 rounded-sm px-2 text-label text-fg-muted hover:text-fg"
          >
            Hide for 30 days
          </button>
        </div>
      ) : null}
    </div>
  );
}

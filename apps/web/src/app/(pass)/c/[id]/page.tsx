import { CalendarDays, Gift, Store, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { campaignsApi } from "@ll/shared";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ShopTile } from "@/components/ui/ShopTile";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const c = await publicServerApi().public.campaign(id);
    return { title: `${c.name} · ${c.neighbourhood.name}`, description: c.description ?? `Visit ${c.goalVisits} shops on ${c.neighbourhood.name} between ${formatDate(c.startsAt)} and ${formatDate(c.endsAt)}.` };
  } catch {
    return { title: "Neighbourhood campaign" };
  }
}

const KIND: Record<string, string> = { passport: "Passport", points_weekend: "Points weekend", multiplier: "Bonus points" };

/** /c/<id>: public BIA campaign page (campaigns.md GET /v1/public/campaigns/:id). */
export default async function CampaignPage({ params }: Props) {
  const { id } = await params;
  let c: campaignsApi.PublicCampaign;
  try {
    c = await publicServerApi().public.campaign(id);
  } catch (e) {
    if (isApiError(e) && (e.status === 404 || e.status === 400)) notFound();
    return <ErrorState title="Can't load this campaign right now" description={copy.err.network} action={<Button variant="secondary" href={`/c/${encodeURIComponent(id)}`}>Try again</Button>} />;
  }
  const me = await getMe();
  let mine: campaignsApi.MyCampaign | null = null;
  if (me) {
    try {
      mine = (await (await getServerApi()).me.campaigns()).items.find((x) => x.id === c.id) ?? null;
    } catch {
      mine = null;
    }
  }
  const visited = new Set(mine?.progress?.visitedMerchantIds ?? []);
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl bg-accent-subtle p-5 text-on-accent-subtle">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{KIND[c.kind] ?? c.kind}</Badge>
          <StatusBadge domain="campaign" status={c.status} label={c.status === "live" ? "On now" : c.status === "scheduled" ? "Coming up" : undefined} />
        </div>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-[38px]">{c.name}</h1>
        <p className="mt-1 text-body">{c.neighbourhood.name}</p>
        <p className="mt-3 flex items-center gap-2 text-body-sm">
          <CalendarDays aria-hidden className="size-4" />
          {formatDate(c.startsAt, true)}, {formatTime(c.startsAt)} – {formatDate(c.endsAt, true)}, {formatTime(c.endsAt)}
        </p>
      </div>
      {c.description ? <p className="text-body text-fg">{c.description}</p> : null}
      <Card className="flex flex-col gap-3">
        <h2 className="text-title text-fg">How it works</h2>
        <ul className="flex flex-col gap-2 text-body text-fg">
          <li className="flex gap-2">
            <Store aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-brand" />
            Visit {c.goalVisits} different participating shops and show your card.
          </li>
          {c.bonusPoints > 0 ? (
            <li className="flex gap-2">
              <Gift aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-brand" />+{c.bonusPoints} bonus points at each new shop you visit, on us.
            </li>
          ) : null}
          {c.multiplierPct ? (
            <li className="flex gap-2">
              <Gift aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-brand" />
              {c.multiplierPct / 100}x points at every participating shop.
            </li>
          ) : null}
          {c.prize ? (
            <li className="flex gap-2">
              <Trophy aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-brand" />
              Complete it to enter the draw: {c.prize}.
            </li>
          ) : null}
        </ul>
        {mine?.progress ? (
          <ProgressBar value={mine.progress.visited} max={mine.progress.goal} tone="accent" label="Your progress" valueText={`${mine.progress.visited} of ${mine.progress.goal} shops`} />
        ) : (
          <Button href={me ? "/map" : "/me"} variant="tonal">
            {me ? "Find participating shops" : "Sign in to track your progress"}
          </Button>
        )}
        {mine?.progress?.completedAt ? <p className="text-body-sm text-success">You&apos;re in the draw. Good luck.</p> : null}
      </Card>
      <section aria-labelledby="shops" className="flex flex-col gap-2">
        <h2 id="shops" className="text-h3 text-fg">
          Participating shops ({c.merchants.length})
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {c.merchants.map((m) => (
            <li key={m.id}>
              <ShopTile variant="list" href={`/shops/${m.slug}`} shop={{ name: m.name, vertical: "other", logoUrl: m.logoUrl }} subtitle={visited.has(m.id) ? "Visited" : undefined} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

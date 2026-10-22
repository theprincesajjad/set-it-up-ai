import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { campaignsApi } from "@ll/shared";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
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
  const steps = [
    `Visit ${c.goalVisits} different participating shops and show your card.`,
    c.bonusPoints > 0 ? `+${c.bonusPoints} bonus points at each new shop you visit, on us.` : null,
    c.multiplierPct ? `${c.multiplierPct / 100}x points at every participating shop.` : null,
    c.prize ? `Complete it to enter the draw: ${c.prize}.` : null,
  ].filter((x): x is string => !!x);
  return (
    <div className="flex flex-col gap-6 pt-2">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
          <span className="lowercase">{c.neighbourhood.name}</span>
          <span aria-hidden>·</span>
          <span>{KIND[c.kind] ?? c.kind}</span>
          <StatusBadge domain="campaign" status={c.status} label={c.status === "live" ? "On now" : c.status === "scheduled" ? "Coming up" : undefined} />
        </div>
        <h1 className="display text-[36px] leading-[1.05] text-fg">{c.name}</h1>
        <p className="text-body text-fg-muted">
          {formatDate(c.startsAt, true)}, {formatTime(c.startsAt)} – {formatDate(c.endsAt, true)}, {formatTime(c.endsAt)}
        </p>
      </header>
      {c.description ? <p className="text-body text-fg">{c.description}</p> : null}
      {mine?.progress ? (
        <div className="flex flex-col gap-3 rounded-card border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-meta text-fg-muted">Your progress</span>
            <span className="display text-title tabular-nums text-accent-text">
              {mine.progress.visited} / {mine.progress.goal}
            </span>
          </div>
          <ProgressBar value={mine.progress.visited} max={mine.progress.goal} tone="accent" showValue={false} label="Your progress" valueText={`${mine.progress.visited} of ${mine.progress.goal} shops`} />
          {mine.progress.completedAt ? <p className="text-meta text-fg">You&apos;re in the draw. Good luck.</p> : null}
        </div>
      ) : null}
      <ListGroup title="How it works">
        {steps.map((t, i) => (
          <li key={t} className="flex gap-3 py-3.5 text-body text-fg">
            <span className="w-4 shrink-0 text-meta-strong tabular-nums text-fg-muted">{i + 1}</span>
            {t}
          </li>
        ))}
      </ListGroup>
      {!mine?.progress ? (
        <Button href={me ? "/map" : "/me"} size="lg" fullWidth>
          {me ? "Find participating shops" : "Sign in to track your progress"}
        </Button>
      ) : null}
      <ListGroup title={`Participating shops (${c.merchants.length})`}>
        {c.merchants.map((m) => (
          <li key={m.id}>
            <ShopTile variant="list" href={`/shops/${m.slug}`} className="-mx-4 px-4 hover:bg-bg-subtle" shop={{ name: m.name, vertical: "other", logoUrl: m.logoUrl }} subtitle={visited.has(m.id) ? "Visited" : undefined} />
          </li>
        ))}
      </ListGroup>
    </div>
  );
}

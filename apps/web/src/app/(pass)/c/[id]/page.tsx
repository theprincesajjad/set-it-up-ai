import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate as formatDateL10n, translator, type campaignsApi } from "@ll/shared";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ShopTile } from "@/components/ui/ShopTile";
import { isApiError } from "@/lib/api/errors";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatDate, formatTime } from "@/lib/format";
import { PassTopBar } from "@/components/pass/PassChrome";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getLocaleForProfile } from "@/lib/i18n/server";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const t = translator(locale);
  const day = (iso: string) => (locale === "en" ? formatDate(iso) : formatDateL10n(locale, iso, { month: "short", day: "numeric" }));
  try {
    const c = await publicServerApi().public.campaign(id);
    return { title: `${c.name} · ${c.neighbourhood.name}`, description: c.description ?? t("wp.t.campaignDesc", { goal: c.goalVisits, hood: c.neighbourhood.name, from: day(c.startsAt), to: day(c.endsAt) }) };
  } catch {
    return { title: t("wp.t.campaign") };
  }
}

const KIND_KEY = { passport: "sh.camp.passport", points_weekend: "sh.camp.pointsWeekend", multiplier: "sh.camp.bonus" } as const;

/** /c/<id>: public BIA campaign page (campaigns.md GET /v1/public/campaigns/:id). */
export default async function CampaignPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await getMe();
  const locale = await getLocaleForProfile(sp, me?.user.locale);
  const t = translator(locale);
  let c: campaignsApi.PublicCampaign;
  try {
    c = await publicServerApi().public.campaign(id);
  } catch (e) {
    if (isApiError(e) && (e.status === 404 || e.status === 400)) notFound();
    return <ErrorState title={t("wp.err.campaign")} description={t("auth.err.network")} action={<Button variant="secondary" href={`/c/${encodeURIComponent(id)}`}>{t("rc.tryAgain")}</Button>} />;
  }
  const en = locale === "en";
  const fmt = (iso: string) => (en ? `${formatDate(iso, true)}, ${formatTime(iso)}` : `${formatDateL10n(locale, iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
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
    t("sh.camp.stepVisit", { goal: c.goalVisits }),
    c.bonusPoints > 0 ? t("sh.camp.stepBonus", { n: c.bonusPoints }) : null,
    c.multiplierPct ? t("sh.camp.stepMult", { n: c.multiplierPct / 100 }) : null,
    c.prize ? t("sh.camp.stepPrize", { prize: c.prize.replace(/\.$/, "") }) : null,
  ].filter((x): x is string => !!x);
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
    <div className="flex flex-col gap-6 pt-2">
      <PassTopBar className="self-stretch" />
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
          <span className="lowercase">{c.neighbourhood.name}</span>
          <span aria-hidden>·</span>
          <span>{c.kind in KIND_KEY ? t(KIND_KEY[c.kind as keyof typeof KIND_KEY]) : c.kind}</span>
          <StatusBadge domain="campaign" status={c.status} label={c.status === "live" ? t("sh.camp.live") : c.status === "scheduled" ? t("sh.camp.soon") : undefined} />
        </div>
        <h1 className="display text-[36px] leading-[1.05] text-fg">{c.name}</h1>
        <p className="text-body text-fg-muted">
          {fmt(c.startsAt)} – {fmt(c.endsAt)}
        </p>
      </header>
      {c.description ? <p className="text-body text-fg">{c.description}</p> : null}
      {mine?.progress ? (
        <div className="flex flex-col gap-3 rounded-card border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-meta text-fg-muted">{t("sh.camp.progress")}</span>
            <span className="display text-title tabular-nums text-points-text">
              {mine.progress.visited} / {mine.progress.goal}
            </span>
          </div>
          <ProgressBar value={mine.progress.visited} max={mine.progress.goal} tone="accent" showValue={false} label={t("sh.camp.progress")} valueText={t("ms.camp.ofShops", { visited: mine.progress.visited, goal: mine.progress.goal })} />
          {mine.progress.completedAt ? <p className="text-meta text-fg">{t("sh.camp.inDraw")}</p> : null}
        </div>
      ) : null}
      <ListGroup title={t("sh.camp.how")}>
        {steps.map((t, i) => (
          <li key={t} className="flex gap-3 py-3.5 text-body text-fg">
            <span className="w-4 shrink-0 text-meta-strong tabular-nums text-fg-muted">{i + 1}</span>
            {t}
          </li>
        ))}
      </ListGroup>
      {!mine?.progress ? (
        <Button href={me ? "/map" : "/me"} size="lg" fullWidth>
          {me ? t("sh.camp.find") : t("sh.camp.signIn")}
        </Button>
      ) : null}
      <ListGroup title={t("sh.camp.shops", { n: c.merchants.length })}>
        {c.merchants.map((m) => (
          <li key={m.id}>
            <ShopTile variant="list" href={`/shops/${m.slug}`} className="-mx-4 px-4 hover:bg-bg-subtle" shop={{ name: m.name, vertical: "other", logoUrl: m.logoUrl }} subtitle={visited.has(m.id) ? t("sh.camp.visited") : undefined} />
          </li>
        ))}
      </ListGroup>
    </div>
    </LocaleScope>
  );
}

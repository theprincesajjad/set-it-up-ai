import { Clock, Globe, MapPin, Navigation, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { customerApi, networkApi } from "@ll/shared";
import { JoinFlow } from "@/components/pass/JoinFlow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DiscountCard } from "@/components/ui/DiscountCard";
import { ErrorState } from "@/components/ui/EmptyState";
import { PointsRing } from "@/components/ui/PointsRing";
import { PromoCard } from "@/components/ui/PromoCard";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopTile } from "@/components/ui/ShopTile";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatPoints } from "@/lib/format";
import { openStatus, weekRows } from "@/lib/hours";
import { howYouEarn } from "@/lib/program";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const s = await publicServerApi().public.shop(slug);
    const where = s.merchant.neighbourhood?.name ?? s.locations[0]?.city ?? "";
    return {
      title: `${s.merchant.name}${where ? ` · ${where}` : ""}`,
      description: s.merchant.description ?? `Earn rewards at ${s.merchant.name}. ${s.program ? howYouEarn(s.program) : ""}`,
      alternates: { canonical: `/shops/${slug}` },
      openGraph: { title: `Earn rewards at ${s.merchant.name}` },
    };
  } catch {
    return { title: "Shop" };
  }
}

function directionsUrl(l: networkApi.LocationDto) {
  const q = l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : `${l.address}, ${l.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export default async function ShopPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ref = typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null;
  let shop: networkApi.PublicShopResponse;
  try {
    shop = await publicServerApi().public.shop(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return <ErrorState title="Can't load this shop right now" description={copy.err.network} action={<Button variant="secondary" href={`/shops/${slug}`}>Try again</Button>} />;
  }

  const me = await getMe();
  let membership: customerApi.MembershipDto | null = null;
  if (me) {
    try {
      const w = await (await getServerApi()).me.memberships();
      membership = w.items.find((m) => m.merchant.id === shop.merchant.id) ?? null;
    } catch {
      membership = null;
    }
  }

  const m = shop.merchant;
  const loc = shop.locations[0] ?? null;
  const program = shop.program;
  const status = loc ? openStatus(loc.hours, m.timezone) : null;
  let nearby: networkApi.ShopListItemDto[] = [];
  if (m.neighbourhood) {
    try {
      nearby = (await publicServerApi().network.shops({ neighbourhood: m.neighbourhood.slug, limit: 8 })).items.filter((s) => s.merchant.id !== m.id).slice(0, 5);
    } catch {
      nearby = [];
    }
  }
  const terminology = program?.terminology ?? "points";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: m.name,
    description: m.description ?? undefined,
    url: `${env.siteUrl}/shops/${m.slug}`,
    image: m.logoUrl ?? undefined,
    telephone: m.phone ?? loc?.phone ?? undefined,
    address: loc ? { "@type": "PostalAddress", streetAddress: loc.address, addressLocality: loc.city, postalCode: loc.postalCode ?? undefined, addressCountry: "CA" } : undefined,
    geo: loc?.lat != null ? { "@type": "GeoCoordinates", latitude: loc.lat, longitude: loc.lng } : undefined,
  };
  const joinInfo: networkApi.JoinInfoResponse | null = loc ? { qrCode: "", merchant: m, location: loc, program, rewards: shop.rewards.slice(0, 3), consentText: shop.consentText } : null;

  return (
    <div className="flex flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ShopTile
        variant="hero"
        shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, coverUrl: m.coverUrl }}
        subtitle={[verticalLabel(m.vertical), m.neighbourhood?.name].filter(Boolean).join(" · ")}
      />
      {status ? (
        <p className={status.open ? "flex items-center gap-2 text-body-sm font-semibold text-success" : "flex items-center gap-2 text-body-sm text-fg-muted"}>
          <Clock aria-hidden className="size-4" />
          {status.label}
        </p>
      ) : null}
      {m.description ? <p className="text-body text-fg">{m.description}</p> : null}

      <div className="grid grid-cols-3 gap-2">
        {m.phone || loc?.phone ? (
          <Button variant="secondary" size="sm" iconStart={Phone} href={`tel:${m.phone ?? loc?.phone}`}>
            Call
          </Button>
        ) : null}
        {loc ? (
          <Button variant="secondary" size="sm" iconStart={Navigation} href={directionsUrl(loc)}>
            Directions
          </Button>
        ) : null}
        {m.website ? (
          <Button variant="secondary" size="sm" iconStart={Globe} href={m.website}>
            Website
          </Button>
        ) : null}
      </div>

      {membership ? (
        <Card className="flex items-center gap-4">
          <PointsRing balance={membership.balance} goal={membership.nextReward?.pointsCost ?? 0} terminology={membership.terminology} size={64} showCaption={false} />
          <div className="flex-1">
            <p className="text-title text-fg">You have {formatPoints(membership.balance, membership.terminology, false)}</p>
            <p className="text-body-sm text-fg-muted">{membership.nextReward ? `${membership.nextReward.pointsNeeded} more for a ${membership.nextReward.name}` : membership.expiryDisclosure}</p>
          </div>
          <Button variant="tonal" size="sm" href="/me">
            My card
          </Button>
        </Card>
      ) : null}

      {program ? (
        <Card>
          <h2 className="text-title text-fg">How you earn here</h2>
          <p className="mt-1 text-body text-fg">{howYouEarn(program)}</p>
          {program.welcomeBonus > 0 ? <p className="mt-1 text-body-sm text-fg-muted">Join and get {formatPoints(program.welcomeBonus, terminology, false)} right away.</p> : null}
          <p className="mt-1 text-body-sm text-fg-muted">{program.expiryDisclosure}</p>
          {m.vertical === "pharmacy" ? <p className="mt-2 text-body-sm text-fg-muted">{copy.misc.pharmacyRule}</p> : null}
        </Card>
      ) : null}

      {shop.rewards.length ? (
        <section aria-labelledby="rewards" className="flex flex-col gap-3">
          <h2 id="rewards" className="text-h3 text-fg">
            Rewards
          </h2>
          {shop.rewards.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              terminology={terminology}
              balance={membership?.balance ?? 0}
              state={membership ? (membership.balance >= r.pointsCost ? "available" : "locked") : "preview"}
            />
          ))}
        </section>
      ) : null}

      {shop.promos.length ? (
        <section aria-labelledby="promos" className="flex flex-col gap-3">
          <h2 id="promos" className="text-h3 text-fg">
            Offers
          </h2>
          {shop.promos.map((p) => (
            <PromoCard key={p.id} variant="compact" promo={p} shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl }} />
          ))}
        </section>
      ) : null}

      {shop.discountCards.length ? (
        <section aria-labelledby="cards" className="flex flex-col gap-3">
          <h2 id="cards" className="text-h3 text-fg">
            Member discount cards
          </h2>
          {shop.discountCards.map((c) => (
            <DiscountCard key={c.id} card={c} shop={m} live={false} />
          ))}
        </section>
      ) : null}

      {loc ? (
        <Card>
          <h2 className="flex items-center gap-2 text-title text-fg">
            <MapPin aria-hidden className="size-5 text-fg-muted" />
            {loc.address}
          </h2>
          <p className="text-body-sm text-fg-muted">
            {loc.city}
            {loc.postalCode ? ` ${loc.postalCode}` : ""}
            {shop.locations.length > 1 ? ` · ${shop.locations.length} locations` : ""}
          </p>
          {loc.hours ? (
            <table className="mt-3 w-full text-body-sm">
              <caption className="sr-only">Opening hours</caption>
              <tbody>
                {weekRows(loc.hours).map((r) => (
                  <tr key={r.day}>
                    <th scope="row" className="py-0.5 text-start font-normal text-fg-muted">
                      {r.day}
                    </th>
                    <td className="py-0.5 text-end tabular-nums text-fg">{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      ) : null}

      {!membership && joinInfo ? (
        <section id="join" aria-label={`Join ${m.name}`} className="scroll-mt-4 rounded-xl bg-surface p-4 shadow-md">
          <JoinFlow info={joinInfo} merchantId={m.id} referralCode={ref} signedIn={!!me} signedInName={me?.user.name ?? null} showHeader={false} autoFocus={false} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} appStoreUrl={env.appStoreUrl} playStoreUrl={env.playStoreUrl} />
        </section>
      ) : null}

      {nearby.length && m.neighbourhood ? (
        <section aria-labelledby="more" className="flex flex-col gap-2">
          <h2 id="more" className="text-h3 text-fg">
            More shops on {m.neighbourhood.name}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {nearby.map((s) => (
              <li key={s.merchant.id}>
                <ShopTile variant="list" href={`/shops/${s.merchant.slug}`} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl }} subtitle={s.location?.address} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!membership && joinInfo ? (
        <div className="sticky bottom-0 z-sticky -mx-4 border-t border-border bg-canvas px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div>
            <Button href="#join" fullWidth size="lg">
              {copy.action.join(m.name)}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

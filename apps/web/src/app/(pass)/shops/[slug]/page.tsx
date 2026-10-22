import { Globe, Navigation, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { customerApi, networkApi } from "@ll/shared";
import { JoinFlow } from "@/components/pass/JoinFlow";
import { ShopTabs } from "@/components/pass/ShopTabs";
import { StickyJoin } from "@/components/pass/StickyJoin";
import { Button } from "@/components/ui/Button";
import { ListGroup } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/Badge";
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

  const quick = [
    m.phone || loc?.phone ? { href: `tel:${m.phone ?? loc?.phone}`, label: "Call", icon: Phone } : null,
    loc ? { href: directionsUrl(loc), label: "Directions", icon: Navigation } : null,
    m.website ? { href: m.website, label: "Website", icon: Globe } : null,
  ].filter((x): x is { href: string; label: string; icon: typeof Phone } => !!x);

  return (
    <div className="flex flex-col gap-6 pt-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ShopTile
        variant="hero"
        shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, coverUrl: m.coverUrl, brandColor: m.brandColor }}
        subtitle={[verticalLabel(m.vertical).toLowerCase(), m.neighbourhood?.name].filter(Boolean).join(" · ")}
      />
      {status || shop.memberCount || shop.features?.orderAhead || shop.features?.serviceTickets ? (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg">
          {status ? <StatusDot tone={status.open ? "positive" : "neutral"}>{status.label}</StatusDot> : null}
          {shop.memberCount ? <span className="text-fg-muted">{shop.memberCount.toLocaleString("en-CA")} neighbours are members</span> : null}
          {shop.features?.orderAhead ? <span className="text-fg-muted">Order ahead in the app</span> : null}
          {shop.features?.serviceTickets ? <span className="text-fg-muted">Repair tracking</span> : null}
        </div>
      ) : null}
      {quick.length ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
          {quick.map((q) => (
            <a key={q.label} href={q.href} {...(/^https?:/.test(q.href) ? { rel: "noopener noreferrer" } : {})} className="flex h-16 flex-col items-center justify-center gap-1 rounded-card bg-bg-subtle text-meta-strong text-fg transition-colors hover:bg-bg-muted active:bg-bg-muted focus-visible:focus-ring">
              <q.icon aria-hidden className="size-5" strokeWidth={1.75} />
              {q.label}
            </a>
          ))}
        </div>
      ) : null}

      {membership ? (
        <div className="flex items-center gap-4 rounded-card border border-line p-4">
          <PointsRing balance={membership.balance} goal={membership.nextReward?.pointsCost ?? 0} terminology={membership.terminology} size={64} showCaption={false} />
          <div className="min-w-0 flex-1">
            <p className="text-meta text-fg-muted">You have</p>
            <p className="display text-title tabular-nums text-accent-text">{formatPoints(membership.balance, membership.terminology, false)}</p>
            <p className="text-meta text-fg-muted">{membership.nextReward ? `${membership.nextReward.pointsNeeded} more for a ${membership.nextReward.name}` : membership.expiryDisclosure}</p>
          </div>
          <Button variant="secondary" size="sm" href="/me">
            My card
          </Button>
        </div>
      ) : null}

      <ShopTabs
        panels={[
          {
            id: "rewards",
            label: "Rewards",
            count: shop.rewards.length,
            content: (
              <>
                {program ? (
                  <ListGroup title="How you earn here" as="div">
                    <div className="flex flex-col gap-1 py-3.5">
                      <p className="text-body-strong text-fg">{howYouEarn(program)}</p>
                      {program.welcomeBonus > 0 ? (
                        <p className="flex items-center gap-2 text-meta text-fg">
                          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                          Join and get {formatPoints(program.welcomeBonus, terminology, false)} right away.
                        </p>
                      ) : null}
                      <p className="text-meta text-fg-muted">{program.expiryDisclosure}</p>
                      {m.vertical === "pharmacy" ? <p className="text-meta text-fg-muted">{copy.misc.pharmacyRule}</p> : null}
                    </div>
                  </ListGroup>
                ) : null}
                {shop.rewards.length ? (
                  <ListGroup title="Rewards">
                    {shop.rewards.map((r) => (
                      <li key={r.id}>
                        <RewardCard layout="row" reward={r} terminology={terminology} balance={membership?.balance ?? 0} state={membership ? (membership.balance >= r.pointsCost ? "available" : "locked") : "preview"} />
                      </li>
                    ))}
                  </ListGroup>
                ) : null}
                {shop.discountCards.map((c) => (
                  <DiscountCard key={c.id} card={c} shop={m} live={false} />
                ))}
              </>
            ),
          },
          {
            id: "promos",
            label: "Promos",
            count: shop.promos.length,
            content: shop.promos.length ? (
              shop.promos.map((p) => <PromoCard key={p.id} variant="compact" promo={p} shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, brandColor: m.brandColor }} />)
            ) : (
              <p className="py-6 text-center text-body text-fg-muted">No offers right now. Members hear about new ones first.</p>
            ),
          },
          {
            id: "about",
            label: "About",
            content: (
              <>
                {m.description ? <p className="text-body text-fg">{m.description}</p> : null}
                {loc ? (
                  <ListGroup title="Visit" as="div">
                    <a href={directionsUrl(loc)} rel="noopener noreferrer" className="-mx-4 flex items-center gap-3 px-4 py-3.5 hover:bg-bg-subtle focus-visible:focus-ring">
                      <div className="min-w-0 flex-1">
                        <p className="text-body-strong text-fg">{loc.address}</p>
                        <p className="text-meta text-fg-muted">
                          {loc.city}
                          {loc.postalCode ? ` ${loc.postalCode}` : ""}
                          {shop.locations.length > 1 ? ` · ${shop.locations.length} locations` : ""}
                        </p>
                      </div>
                      <span className="text-meta-strong text-fg">Directions</span>
                    </a>
                    {loc.hours ? (
                      <table className="my-2 w-full text-meta">
                        <caption className="sr-only">Opening hours</caption>
                        <tbody>
                          {weekRows(loc.hours).map((r) => (
                            <tr key={r.day}>
                              <th scope="row" className="py-1 text-start font-normal text-fg-muted">
                                {r.day}
                              </th>
                              <td className="py-1 text-end tabular-nums text-fg">{r.text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                    {m.instagram ? (
                      <a href={m.instagram.startsWith("http") ? m.instagram : `https://instagram.com/${m.instagram.replace(/^@/, "")}`} rel="noopener noreferrer" className="-mx-4 flex items-center justify-between px-4 py-3.5 text-body text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                        <span>Instagram</span>
                        <span className="text-fg-muted">@{m.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}</span>
                      </a>
                    ) : null}
                  </ListGroup>
                ) : null}
              </>
            ),
          },
        ]}
      />

      {!membership && joinInfo ? (
        <section id="join" aria-label={`Join ${m.name}`} className="scroll-mt-4 rounded-sheet bg-bg-subtle p-5">
          <JoinFlow info={joinInfo} merchantId={m.id} referralCode={ref} signedIn={!!me} signedInName={me?.user.name ?? null} showHeader={false} autoFocus={false} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} appStoreUrl={env.appStoreUrl} playStoreUrl={env.playStoreUrl} />
        </section>
      ) : null}

      {nearby.length && m.neighbourhood ? (
        <ListGroup title={`More shops on ${m.neighbourhood.name}`}>
          {nearby.map((s) => (
            <li key={s.merchant.id}>
              <ShopTile variant="list" href={`/shops/${s.merchant.slug}`} className="-mx-4 px-4 hover:bg-bg-subtle" shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} subtitle={s.location?.address} />
            </li>
          ))}
        </ListGroup>
      ) : null}

      {!membership && joinInfo ? (
        <StickyJoin label={copy.action.join(m.name)} />
      ) : null}
    </div>
  );
}

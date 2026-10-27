import { Globe, MessageCircle, Navigation, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GroceryBlock } from "@/components/grocery/GroceryBlock";
import { HalalBlock } from "@/components/restaurant/HalalBlock";
import { PopularRow } from "@/components/restaurant/PopularRow";
import { RestaurantLinks } from "@/components/restaurant/RestaurantLinks";
import { WeekendPots } from "@/components/restaurant/WeekendPots";
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
import { isApiError } from "@/lib/api/errors";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { unitsText } from "@/lib/units";
import { expiryLineL, howYouEarnL, kindL, openStatusL, rewardInSentenceL, weekRowsL } from "@/lib/i18n/formatL";
import { MemberWalletButtons } from "@/components/pass/MemberWalletButtons";
import { howYouEarn } from "@/lib/program";
import { LanguageSwitcher, LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { LOCALES, formatCurrency, translator, type commerceApi, type restaurantWebApi } from "@ll/shared";
import { publicRestaurantApi } from "@/lib/restaurant/server";
import { whatsappChatUrl } from "@/lib/restaurant/share";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getT();
  const english = (await getLocale()) === "en";
  try {
    const s = await publicServerApi().public.shop(slug);
    const where = s.merchant.neighbourhood?.name ?? s.locations[0]?.city ?? "";
    return {
      title: `${s.merchant.name}${where ? ` · ${where}` : ""}`,
      description: s.merchant.description ?? `${t("wp.t.shopEarn", { shop: s.merchant.name })}${english ? `. ${s.program ? howYouEarn(s.program) : ""}` : "."}`,
      alternates: { canonical: `/shops/${slug}` },
      openGraph: { title: t("wp.t.shopEarn", { shop: s.merchant.name }) },
    };
  } catch {
    return { title: t("wp.t.shop") };
  }
}

function directionsUrl(l: networkApi.LocationDto) {
  const q = l.lat != null && l.lng != null ? `${l.lat},${l.lng}` : `${l.address}, ${l.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export default async function ShopPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const L = { locale, t };
  const ref = typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null;
  let shop: networkApi.PublicShopResponse;
  try {
    shop = await publicServerApi().public.shop(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return <ErrorState title={t("wp.err.shop")} description={t("auth.err.network")} action={<Button variant="secondary" href={`/shops/${slug}`}>{t("rc.tryAgain")}</Button>} />;
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
  const status = loc ? openStatusL(L, loc.hours, m.timezone) : null;
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

  // Restaurant pack shops lead with food: halal block, order buttons, this weekend's pots, most ordered, rewards last (frame 10).
  const f = shop.features;
  const maybeRestaurant = !!(f?.dietaryTags || f?.tiffin || f?.catering || f?.banquet || f?.whatsapp);
  const rest: restaurantWebApi.PublicRestaurantResponse | null = maybeRestaurant ? await publicRestaurantApi().restaurant(slug).catch(() => null) : null;
  let restMenu: commerceApi.PublicMenuResponse | null = null;
  if (rest && (rest.popular.length || rest.features.preorder)) restMenu = await publicRestaurantApi().menu(slug, { lang: locale }).catch(() => null);
  // Grocers and butchers: this week's flyer and the butcher counter's pre-order items (docs/research/grocers.md).
  const groceryShop = m.vertical === "grocery";
  const flyer = groceryShop ? await publicServerApi().public.flyer(slug).catch(() => null) : null;
  const butcher = groceryShop && !rest ? await publicRestaurantApi().restaurant(slug).catch(() => null) : null;
  const menuItems = restMenu ? [...restMenu.categories.flatMap((c) => c.items), ...restMenu.uncategorized] : [];
  const popularItems = rest ? rest.popular.map((id) => menuItems.find((i) => i.id === id)).filter((i): i is commerceApi.CatalogItemDto => !!i) : [];
  const base = `/shops/${encodeURIComponent(m.slug)}`;
  const preorderHref = rest?.preorderItems.length === 1 ? `${base}/preorder/${rest.preorderItems[0]!.id}` : `${base}/menu#cat-degh`;
  const phone = m.phone ?? loc?.phone ?? null;

  const quick = (
    rest
      ? [
          phone ? { href: `tel:${phone}`, label: t("shop.call"), icon: Phone } : null,
          loc ? { href: directionsUrl(loc), label: t("shop.directions"), icon: Navigation } : null,
          rest.whatsappNumber ? { href: whatsappChatUrl(rest.whatsappNumber), label: t("rs.whatsapp"), icon: MessageCircle } : m.website ? { href: m.website, label: t("shop.website"), icon: Globe } : null,
        ]
      : [
          m.phone || loc?.phone ? { href: `tel:${m.phone ?? loc?.phone}`, label: t("shop.call"), icon: Phone } : null,
          loc ? { href: directionsUrl(loc), label: t("shop.directions"), icon: Navigation } : null,
          m.website ? { href: m.website, label: t("shop.website"), icon: Globe } : null,
        ]
  ).filter((x): x is { href: string; label: string; icon: typeof Phone } => !!x);
  const quickRow = quick.length ? (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
      {quick.map((q) => (
        <a key={q.label} href={q.href} {...(/^https?:/.test(q.href) ? { rel: "noopener noreferrer" } : {})} className="flex h-16 flex-col items-center justify-center gap-1 rounded-card bg-bg-subtle text-meta-strong text-fg transition-colors hover:bg-bg-muted active:bg-bg-muted focus-visible:focus-ring">
          <q.icon aria-hidden className="size-5" strokeWidth={1.75} />
          {q.label}
        </a>
      ))}
    </div>
  ) : null;

  return (
    <LocaleScope locale={locale} className="flex flex-col gap-6 pt-2">
      <LanguageSwitcher className="self-start" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ShopTile
        variant="hero"
        shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, coverUrl: m.coverUrl, brandColor: m.brandColor }}
        subtitle={[kindL(L, m.vertical), m.neighbourhood?.name.toLowerCase()].filter(Boolean).join(" · ")}
      />
      {status || shop.memberCount || shop.features?.orderAhead || shop.features?.serviceTickets ? (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg">
          {status ? <StatusDot tone={status.open ? "positive" : "neutral"}>{status.label.charAt(0).toLowerCase() + status.label.slice(1)}</StatusDot> : null}
          {shop.memberCount ? <span className="text-fg-muted">{t("shop.membersCount", { n: shop.memberCount.toLocaleString("en-CA") })}</span> : null}
          {rest ? (rest.quotedWaitMin ? <span className="text-fg-muted">{t("rs.pickupWait", { min: rest.quotedWaitMin })}</span> : null) : shop.features?.orderAhead ? <span className="text-fg-muted">{t("shop.orderAheadInApp")}</span> : null}
          {shop.features?.serviceTickets ? <span className="text-fg-muted">{t("shop.repairTracking")}</span> : null}
        </div>
      ) : null}
      {rest?.halalCertification ? <HalalBlock cert={rest.halalCertification} variant="shop" /> : null}
      {rest && (rest.features.pickup || rest.features.preorder) ? (
        <div className="flex flex-col gap-3">
          {rest.features.pickup && rest.acceptingOrders ? (
            <Button size="lg" fullWidth href={`${base}/menu`}>
              {t("rs.orderPickup")}
            </Button>
          ) : null}
          {rest.features.preorder ? (
            <Button size="lg" variant="secondary" fullWidth href={preorderHref}>
              {t("rs.preorderDegh")}
            </Button>
          ) : null}
          {rest.features.pickup && !rest.acceptingOrders ? <p className="text-center text-meta text-fg-muted">{t("rs.notTakingOrders")}</p> : null}
        </div>
      ) : null}
      {shop.features?.appointments ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth href={`${base}/book`}>
            {t("bk.shop.book")}
          </Button>
          <p className="text-center text-meta text-fg-muted">{t("bk.shop.bookSub")}</p>
        </div>
      ) : null}
      {shop.features?.dropoffScheduling ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth variant={shop.features?.appointments ? "secondary" : "primary"} href={`${base}/dropoff`}>
            {t("sv.d.link")}
          </Button>
          <p className="text-center text-meta text-fg-muted">{t("sv.d.linkSub")}</p>
        </div>
      ) : null}
      {quickRow}
      {groceryShop ? <GroceryBlock shopName={m.name} slug={m.slug} flyer={flyer} preorderItems={butcher?.preorderItems ?? []} member={!!membership} /> : null}
      {rest ? <WeekendPots weekend={rest.weekend} items={rest.preorderItems} /> : null}
      {rest ? <PopularRow slug={m.slug} items={popularItems} /> : null}

      <Suspense fallback={null}>
        <RestaurantLinks slug={m.slug} locale={locale} features={shop.features} skipMenu={!!rest?.features.pickup} />
      </Suspense>

      {membership ? (
        <div className="flex flex-col gap-4 rounded-card border border-line p-4">
        <div className="flex items-center gap-4">
          <PointsRing balance={membership.balance} goal={membership.nextReward?.pointsCost ?? 0} terminology={membership.terminology} size={64} showCaption={false} />
          <div className="min-w-0 flex-1">
            <p className="text-meta text-fg-muted">{t("wp.shop.youHave")}</p>
            <p className="display text-title tabular-nums text-accent-text">{unitsText(locale, membership.balance, membership.terminology, false)}</p>
            <p className="text-meta text-fg-muted">{membership.nextReward ? t("ui.stampMore", { n: membership.nextReward.pointsNeeded, reward: rewardInSentenceL(L, membership.nextReward.name) }) : expiryLineL(L, membership)}</p>
          </div>
          <Button variant="secondary" size="sm" href="/me">
            {t("sh.fs.ctaCard")}
          </Button>
        </div>
        <MemberWalletButtons />
        </div>
      ) : null}

      <ShopTabs
        panels={[
          {
            id: "rewards",
            label: t("shop.rewards"),
            count: shop.rewards.length,
            content: (
              <>
                {program ? (
                  <ListGroup title={t("shop.howEarn")} as="div">
                    <div className="flex flex-col gap-1 py-3.5">
                      <p dir="auto" className="text-body-strong text-fg">{howYouEarnL(L, program, formatCurrency(locale, 100))}</p>
                      {program.welcomeBonus > 0 ? (
                        <p className="text-meta text-fg">
                          {t("shop.welcomeBonus", { points: unitsText(locale, program.welcomeBonus, terminology, false) })}
                        </p>
                      ) : null}
                      <p dir="auto" className="text-meta text-fg-muted">{expiryLineL(L, { expiryDisclosure: program.expiryDisclosure, terminology, program })}</p>
                      {m.vertical === "pharmacy" ? <p className="text-meta text-fg-muted">{t("wp.shop.pharmacyRule")}</p> : null}
                    </div>
                  </ListGroup>
                ) : null}
                {shop.rewards.length ? (
                  <ListGroup title={t("shop.rewards")}>
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
            label: t("shop.promos"),
            count: shop.promos.length,
            content: shop.promos.length ? (
              shop.promos.map((p) => <PromoCard key={p.id} variant="compact" promo={p} shop={{ name: m.name, vertical: m.vertical, logoUrl: m.logoUrl, brandColor: m.brandColor }} />)
            ) : (
              <p className="py-6 text-center text-body text-fg-muted">{t("wp.shop.noOffers")}</p>
            ),
          },
          {
            id: "about",
            label: t("shop.about"),
            content: (
              <>
                {m.description ? <p className="text-body text-fg">{m.description}</p> : null}
                {loc ? (
                  <ListGroup title={t("wp.shop.visit")} as="div">
                    <a href={directionsUrl(loc)} rel="noopener noreferrer" className="-mx-4 flex items-center gap-3 px-4 py-3.5 hover:bg-bg-subtle focus-visible:focus-ring">
                      <div className="min-w-0 flex-1">
                        <p className="text-body-strong text-fg">{loc.address}</p>
                        <p className="text-meta text-fg-muted">
                          {loc.city}
                          {loc.postalCode ? ` ${loc.postalCode}` : ""}
                          {shop.locations.length > 1 ? ` · ${t("wp.shop.locationsN", { n: shop.locations.length })}` : ""}
                        </p>
                      </div>
                      <span className="text-meta-strong text-fg">{t("shop.directions")}</span>
                    </a>
                    {loc.hours ? (
                      <table className="my-2 w-full text-meta">
                        <caption className="sr-only">{t("wp.shop.hoursCaption")}</caption>
                        <tbody>
                          {weekRowsL(L, loc.hours).map((r) => (
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
        <section id="join" aria-label={t("auth.join.joinShop", { shop: m.name })} className="scroll-mt-4 rounded-sheet bg-bg-subtle p-5">
          <JoinFlow info={joinInfo} merchantId={m.id} referralCode={ref} signedIn={!!me} signedInName={me?.user.name ?? null} showHeader={false} autoFocus={false} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} appStoreUrl={env.appStoreUrl} playStoreUrl={env.playStoreUrl} />
        </section>
      ) : null}

      {nearby.length && m.neighbourhood ? (
        <ListGroup title={t("wp.shop.moreOn", { hood: m.neighbourhood.name })}>
          {nearby.map((s) => (
            <li key={s.merchant.id}>
              <ShopTile variant="list" href={`/shops/${s.merchant.slug}`} className="-mx-4 px-4 hover:bg-bg-subtle" shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} subtitle={s.location?.address} />
            </li>
          ))}
        </ListGroup>
      ) : null}

      {!membership && joinInfo && !rest ? (
        <StickyJoin label={t("auth.join.joinShop", { shop: LOCALES[locale].dir === "rtl" ? `\u2068${m.name}\u2069` : m.name })} />
      ) : null}
    </LocaleScope>
  );
}

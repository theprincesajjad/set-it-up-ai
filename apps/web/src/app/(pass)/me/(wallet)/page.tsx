import type { Metadata } from "next";
import type { appointmentsApi, campaignsApi, groceryApi, networkApi, tiffinApi } from "@ll/shared";
import { PantryReminders } from "@/components/pass/PantryReminders";
import { NextVisitCard } from "@/components/pass/NextVisitCard";
import { PeopleLinks } from "@/components/pass/PeopleLinks";
import { DealsInbox } from "@/components/pass/DealsInbox"; // wave-n: promo
import { lastFinished } from "@/lib/people";
import { PetLinks } from "@/components/pass/PetLinks";
import { VehicleLinks } from "@/components/pass/VehicleLinks";
import { WaitlistLinks } from "@/components/pass/WaitlistLinks"; // phase-pro: p2
import { TiffinLinks } from "@/components/pass/TiffinLinks";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { CardFan } from "@/components/pass/ShopBrand";
import Link from "next/link";
import { Wallet } from "@/components/pass/Wallet";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { serverRestaurantApi } from "@/lib/restaurant/server";
import { getMe } from "@/lib/auth/session";
import { formatDate } from "@ll/shared";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getLocaleForProfile, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sh.fs.ctaCard"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The soonest booking that is confirmed and still ahead. */
function soonest(visits: appointmentsApi.MyAppointmentDto[]): appointmentsApi.MyAppointmentDto | null {
  const now = Date.now();
  return visits.filter((a) => a.status === "booked" && !a.pending && new Date(a.endsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
}

export default async function MePage({ searchParams }: Props) {
  const me = await getMe();
  const sp = await searchParams;
  if (!me) {
    const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
    return (
      <PageFrame locale={locale} className="flex flex-col gap-6 pt-2">
        {/* wave-p: a returning customer sees their cards before anything is asked, and a newcomer gets a way out (find a shop). */}
        <div className="flex justify-center pt-4">
          <CardFan />
        </div>
        <PhoneSignIn devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} title={t("cust.me.signInTitle")} intro={t("auth.phone.cardIntro")} />
        <div className="flex flex-col gap-1 border-t border-line pt-5">
          <p className="text-body-strong text-fg">{t("cust.me.newTitle")}</p>
          <p className="text-meta text-fg-muted">{t("cust.me.newBody")}</p>
          <Link href="/map" className="mt-1 inline-flex min-h-11 items-center self-start text-meta-strong text-fg underline underline-offset-2 focus-visible:focus-ring">{t("cust.me.newCta")}</Link>
        </div>
      </PageFrame>
    );
  }
  const api = await getServerApi();
  const data = await Promise.all([api.me.profile(), api.me.memberships(), api.me.card().catch(() => null), api.me.campaigns().then((r) => r.items).catch(() => [] as campaignsApi.MyCampaign[]), api.me.pantry().then((r) => r.items).catch(() => [] as groceryApi.MyPantryResponse["items"]), api.me.myPets().then((r) => r.items.length).catch(() => 0), api.me.myFoodCards().then((r) => r.items.length).catch(() => 0), api.me.myVehicles().then((r) => r.vehicles.length).catch(() => 0), serverRestaurantApi().then((r) => r.tiffin.mine()).then((r) => r.items).catch(() => [] as tiffinApi.MySubscriptionDto[]), api.me.appointments().then((r) => r.items).catch(() => [] as appointmentsApi.MyAppointmentDto[])]).catch(() => null);
  if (!data) {
    const t = await getT(sp);
    return <ErrorState title={t("wp.err.card")} description={t("rc.error.body")} action={<Button variant="secondary" href="/me">{t("rc.tryAgain")}</Button>} />;
  }
  const [profile, wallet, card, campaigns, pantry, petCount, foodCount, vehicleCount, tiffin, visits] = data;
  // Your next visit.
  const nextVisit = soonest(visits);
  const petShop = wallet.items.find((m) => m.merchant.vertical === "pet")?.merchant.name ?? null;
  // "Nearby on your street": shops on the member's street they haven't joined, a live promo first.
  const hoods = await publicServerApi().network.neighbourhoods().then((r) => r.items).catch(() => [] as networkApi.NeighbourhoodDto[]);
  const hood = hoods.find((h) => h.id === profile.homeNeighbourhood?.id) ?? hoods.find((h) => h.id === wallet.items[0]?.merchant.neighbourhoodId) ?? null;
  const nearby = hood
    ? await api.network.shops({ neighbourhood: hood.slug, limit: 100 }).then((r) => r.items.filter((s) => !s.isMember && !wallet.items.some((m) => m.merchant.id === s.merchant.id)).sort((a, b) => Number(b.hasPromo || !!b.promoLine) - Number(a.hasPromo || !!a.promoLine) || (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0)).slice(0, 3)).catch(() => [] as networkApi.ShopListItemDto[])
    : [];
  // The shopper's own language: ?lang= / the saved choice, else the language on their profile.
  const locale = await getLocaleForProfile(sp, profile.locale);
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <Wallet
        profile={profile}
        wallet={wallet}
        card={card}
        campaigns={campaigns}
        endsLabels={Object.fromEntries(campaigns.map((c) => [c.id, formatDate(locale, c.endsAt, { month: "short", day: "numeric" })]))}
        nearby={nearby}
        nextVisit={nextVisit ? <NextVisitCard appt={nextVisit} /> : null}
        extras={
          <>
            {/* wave-n promo: the Deals inbox (running deals, door-crasher spots, per-shop consent) */}
            <DealsInbox />
            {/* phase-solo D: book again, messages from shops, reminders on this phone */}
            <PeopleLinks last={nextVisit ? null : lastFinished(visits)} hasVisits={visits.length > 0} />
            <WaitlistLinks />{/* phase-pro: p2: "Waiting for a spot" */}
            <TiffinLinks items={tiffin} />
            <PantryReminders items={pantry} />
            <PetLinks pets={petCount} cards={foodCount} shop={petShop} />
            <VehicleLinks vehicles={vehicleCount} />
          </>
        }
      />
    </LocaleScope>
  );
}

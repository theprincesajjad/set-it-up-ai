import type { Metadata } from "next";
import type { campaignsApi, groceryApi } from "@ll/shared";
import { PantryReminders } from "@/components/pass/PantryReminders";
import { PetLinks } from "@/components/pass/PetLinks";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Wallet } from "@/components/pass/Wallet";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { getServerApi } from "@/lib/api/server";
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

export default async function MePage({ searchParams }: Props) {
  const me = await getMe();
  const sp = await searchParams;
  if (!me) {
    const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
    return (
      <PageFrame locale={locale} className="flex flex-col gap-4 pt-2">
        <PhoneSignIn devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} title={t("auth.phone.cardTitle")} intro={t("auth.phone.cardIntro")} />
      </PageFrame>
    );
  }
  const api = await getServerApi();
  const data = await Promise.all([api.me.profile(), api.me.memberships(), api.me.card().catch(() => null), api.me.campaigns().then((r) => r.items).catch(() => [] as campaignsApi.MyCampaign[]), api.me.pantry().then((r) => r.items).catch(() => [] as groceryApi.MyPantryResponse["items"]), api.me.myPets().then((r) => r.items.length).catch(() => 0), api.me.myFoodCards().then((r) => r.items.length).catch(() => 0)]).catch(() => null);
  if (!data) {
    const t = await getT(sp);
    return <ErrorState title={t("wp.err.card")} description={t("auth.err.network")} action={<Button variant="secondary" href="/me">{t("rc.tryAgain")}</Button>} />;
  }
  const [profile, wallet, card, campaigns, pantry, petCount, foodCount] = data;
  // The shopper's own language: ?lang= / the saved choice, else the language on their profile.
  const locale = await getLocaleForProfile(sp, profile.locale);
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <Wallet profile={profile} wallet={wallet} card={card} campaigns={campaigns} endsLabels={Object.fromEntries(campaigns.map((c) => [c.id, formatDate(locale, c.endsAt, { month: "short", day: "numeric" })]))} />
      <PantryReminders items={pantry} />
      <PetLinks pets={petCount} cards={foodCount} />
    </LocaleScope>
  );
}

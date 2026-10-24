import type { Metadata } from "next";
import type { campaignsApi } from "@ll/shared";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Wallet } from "@/components/pass/Wallet";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { formatDate } from "@ll/shared";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getLocaleForProfile, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My card", robots: { index: false } };

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
  const data = await Promise.all([api.me.profile(), api.me.memberships(), api.me.card().catch(() => null), api.me.campaigns().then((r) => r.items).catch(() => [] as campaignsApi.MyCampaign[])]).catch(() => null);
  if (!data) return <ErrorState title="Can't load your card right now" description={copy.err.network} action={<Button variant="secondary" href="/me">Try again</Button>} />;
  const [profile, wallet, card, campaigns] = data;
  // The shopper's own language: ?lang= / the saved choice, else the language on their profile.
  const locale = await getLocaleForProfile(sp, profile.locale);
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <Wallet profile={profile} wallet={wallet} card={card} campaigns={campaigns} endsLabels={Object.fromEntries(campaigns.map((c) => [c.id, formatDate(locale, c.endsAt, { month: "short", day: "numeric" })]))} />
    </LocaleScope>
  );
}

import type { Metadata } from "next";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Wallet } from "@/components/pass/Wallet";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My card", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MePage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) {
    const sp = await searchParams;
    const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
    return (
      <PageFrame locale={locale} className="flex flex-col gap-4 pt-2">
        <PhoneSignIn devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} title={t("auth.phone.cardTitle")} intro={t("auth.phone.cardIntro")} />
      </PageFrame>
    );
  }
  const api = await getServerApi();
  const data = await Promise.all([api.me.profile(), api.me.memberships(), api.me.card().catch(() => null)]).catch(() => null);
  if (!data) return <ErrorState title="Can't load your card right now" description={copy.err.network} action={<Button variant="secondary" href="/me">Try again</Button>} />;
  const [profile, wallet, card] = data;
  return <Wallet profile={profile} wallet={wallet} card={card} />;
}

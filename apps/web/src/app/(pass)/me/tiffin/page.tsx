import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Heading } from "@/components/restaurant/ui";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { TiffinManage } from "@/components/restaurant/TiffinManage";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("rc.tm.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/tiffin: manage subscriptions. Signed-out visitors sign in right here (phone + code, in their language) and the page refreshes into their plans. */
export default async function MyTiffinPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale} trade="tiffin">
      <Heading>{t("rc.tm.title")}</Heading>
      {me ? (
        <TiffinManage />
      ) : (
        <PhoneSignIn heading="h2" title={t("rc.tm.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
      )}
    </PageFrame>
  );
}

import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { FamilyManager } from "@/components/pass/FamilyManager";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("fam.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/family: the people on this card (a first name each, with the parent's consent). Signed-out visitors sign in right here. */
export default async function MyFamilyPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale} trade="other">
      {me ? <FamilyManager /> : <PhoneSignIn heading="h2" next="/me/family" title={t("fam.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}
    </PageFrame>
  );
}

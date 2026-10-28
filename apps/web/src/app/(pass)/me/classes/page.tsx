import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { ClassPasses } from "@/components/pass/ClassPasses";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Heading } from "@/components/restaurant/ui";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("cl.ui.passes.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/classes: memberships, packs and booked classes. Signed-out visitors sign in right here. */
export default async function MyClassesPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale} trade="fitness">
      <Heading>{t("cl.ui.passes.title")}</Heading>
      {me ? <ClassPasses /> : <PhoneSignIn heading="h2" title={t("cl.ui.passes.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}
    </PageFrame>
  );
}

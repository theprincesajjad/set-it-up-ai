import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { MyVehicles } from "@/components/pass/MyVehicles";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auto.my.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/vehicles: my cars, what is due and the tire swap days. Signed-out visitors sign in right here. */
export default async function MyVehiclesPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale}>
      {me ? <MyVehicles /> : <PhoneSignIn heading="h2" next="/me/vehicles" title={t("auto.my.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}
    </PageFrame>
  );
}

import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { MyPets } from "@/components/pass/MyPets";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("pet.my.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/pets: my pets, their shots and the photo of each certificate. Signed-out visitors sign in right here. */
export default async function MyPetsPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale} trade="pet">
      {me ? <MyPets /> : <PhoneSignIn heading="h2" next="/me/pets" title={t("pet.my.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}
    </PageFrame>
  );
}

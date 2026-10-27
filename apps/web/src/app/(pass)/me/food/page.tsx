import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { MyFoodCards } from "@/components/pass/MyFoodCards";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("pet.food.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/food: my food cards (bags counted, the next free bag) and the run-out text I control. */
export default async function MyFoodPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale}>
      {me ? <MyFoodCards /> : <PhoneSignIn heading="h2" next="/me/food" title={t("pet.food.signIn")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}
    </PageFrame>
  );
}

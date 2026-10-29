import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { MyThreads } from "@/components/pass/MyMessages";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("inbox.me.title"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/messages: my conversations with shops (phase solo, workstream D). */
export default async function MyMessagesPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return <PageFrame locale={locale}>{me ? <MyThreads /> : <PhoneSignIn heading="h2" next="/me/messages" title={t("inbox.me.title")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}</PageFrame>;
}

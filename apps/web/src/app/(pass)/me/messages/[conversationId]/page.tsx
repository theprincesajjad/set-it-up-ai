import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { MyThread } from "@/components/pass/MyMessages";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("inbox.me.title"), robots: { index: false } };
}

type Props = { params: Promise<{ conversationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/messages/<id>: one conversation with a shop, with a reply box. */
export default async function MyThreadPage({ params, searchParams }: Props) {
  const [{ conversationId }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const me = await getMe();
  return <PageFrame locale={locale}>{me ? <MyThread id={conversationId} /> : <PhoneSignIn heading="h2" next={`/me/messages/${conversationId}`} title={t("inbox.me.title")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />}</PageFrame>;
}

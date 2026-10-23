import type { Metadata } from "next";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { DriverRun } from "@/components/restaurant/DriverRun";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your run", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /d/<token>: the driver's page for one route and day. No login; the token is the key. Mobile first. */
export default async function DriverPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  return (
    <PageFrame locale={locale} className="flex flex-col gap-4 pt-2 pb-28">
      <DriverRun token={token} />
    </PageFrame>
  );
}

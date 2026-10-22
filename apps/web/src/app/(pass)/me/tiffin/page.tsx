import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Heading } from "@/components/restaurant/ui";
import { TiffinManage } from "@/components/restaurant/TiffinManage";
import { Button } from "@/components/ui/Button";
import { getMe } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My tiffin", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /me/tiffin: manage subscriptions. Signed-out visitors go to the existing login flow and come back here. */
export default async function MyTiffinPage({ searchParams }: Props) {
  const locale = await getLocale(await searchParams);
  const t = translator(locale);
  const me = await getMe();
  return (
    <PageFrame locale={locale}>
      <Heading>{t("rc.tm.title")}</Heading>
      {me ? (
        <TiffinManage />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body text-fg-muted">{t("rc.tm.signIn")}</p>
          <Button size="lg" fullWidth href={`/login?next=${encodeURIComponent("/me/tiffin")}`}>
            {t("rc.signIn")}
          </Button>
        </div>
      )}
    </PageFrame>
  );
}

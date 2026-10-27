import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MerchantProvider } from "@/components/dashboard/MerchantContext";
import { LocaleScope } from "@/lib/i18n/LocaleScope";
import { getLocale } from "@/lib/i18n/server";
import { getServerApi } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { requireMe } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Door tablet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The tablet at the door: a page of its own with none of the dashboard around it (no sidebar, no client list, no owner name or email).
 * The tablet stays signed in as staff, so it can only be left with a staff PIN (see DoorTablet).
 */
export default async function DoorLayout({ children, params }: { children: ReactNode; params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const me = await requireMe(`/door/${merchantId}`);
  const membership = me.merchants.find((m) => m.merchantId === merchantId);
  if (!membership && me.platformRole === "none") notFound();
  const api = (await getServerApi()).merchant(merchantId);
  let detail, features;
  try {
    [detail, features] = await Promise.all([api.detail(), api.features()]);
  } catch (e) {
    if (isApiError(e) && [401, 403, 404].includes(e.status)) notFound();
    throw e;
  }
  const locale = await getLocale();
  return (
    <MerchantProvider me={me} initialDetail={detail} initialFeatures={features} role={detail.role} viewingAs={null}>
      <LocaleScope locale={locale} className="min-h-screen bg-bg">
        <main id="main" className="mx-auto w-full max-w-[1100px] px-4 py-6">{children}</main>
      </LocaleScope>
    </MerchantProvider>
  );
}

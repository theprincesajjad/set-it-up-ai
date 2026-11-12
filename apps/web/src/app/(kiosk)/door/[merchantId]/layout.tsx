import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MerchantProvider } from "@/components/dashboard/MerchantContext";
import { ThemeStyle } from "@/components/ui/ThemeStyle";
import { getServerApi } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { SessionGuard } from "@/components/errors";
import { ServiceUnreachable } from "@/components/errors/server";
import { currentPath, requireMeOrOutage } from "@/lib/auth/session";
import { preloadInter } from "@/lib/fonts/inter";

/** The title is set by the page (it reads ?lang=). */
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The tablet at the door: a page of its own with none of the dashboard around it (no sidebar, no client list, no owner name or email).
 * The tablet stays signed in as staff, so it can only be left with a staff PIN (see DoorTablet).
 */
export default async function DoorLayout({ children, params }: { children: ReactNode; params: Promise<{ merchantId: string }> }) {
  preloadInter();
  const { merchantId } = await params;
  const auth = await requireMeOrOutage(await currentPath(`/door/${merchantId}`));
  // The tablet stays signed in through an outage: say we cannot reach Local Loyalty and let it try again, never send it to /login.
  if (auth.outage) return <ServiceUnreachable audience="staff" counterHref={`/m/${merchantId}/counter`} />;
  const me = auth.me;
  const membership = me.merchants.find((m) => m.merchantId === merchantId);
  if (!membership && me.platformRole === "none") notFound();
  const api = (await getServerApi()).merchant(merchantId);
  let detail, features;
  try {
    [detail, features] = await Promise.all([api.detail(), api.features()]);
  } catch (e) {
    if (isApiError(e) && [401, 403, 404].includes(e.status)) notFound();
    if (isApiError(e) && (e.isNetwork || e.status >= 500)) return <ServiceUnreachable audience="staff" counterHref={`/m/${merchantId}/counter`} />;
    throw e;
  }
  // The language scope lives in the page, not here: a layout is not re-rendered when only ?lang= changes, so the language chips would do nothing.
  return (
    <ThemeStyle style={detail.merchant.themeStyle} dark={detail.merchant.themeDark} merchantId={detail.merchant.id}>
      <MerchantProvider me={me} initialDetail={detail} initialFeatures={features} role={detail.role} viewingAs={null}>
        {/* The language scope lives in the page, so the banner brings its own English-or-chosen text through useLocaleOrEnglish. */}
        <SessionGuard />
        {children}
      </MerchantProvider>
    </ThemeStyle>
  );
}

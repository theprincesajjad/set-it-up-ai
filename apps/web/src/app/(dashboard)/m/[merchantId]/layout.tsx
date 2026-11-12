import type { Metadata } from "next";
import type { authApi } from "@ll/shared";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MerchantProvider } from "@/components/dashboard/MerchantContext";
import { MerchantShell } from "@/components/dashboard/MerchantShell";
import { SessionGuard } from "@/components/errors";
import { AccessDenied, ServiceUnreachable, accountLabel, homeFor } from "@/components/errors/server";
import { ThemeStyle } from "@/components/ui/ThemeStyle";
import { getServerApi } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { currentPath, requireMeOrOutage } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false, follow: false } };

/**
 * Merchant dashboard guard (merchant-dashboard.md): signed in + staff at this merchant.
 * Platform admins and the merchant's own rep pass the API's requireStaff and see an
 * impersonation banner ("Viewing as ... Changes are logged.").
 */
export default async function MerchantLayout({ children, params }: { children: ReactNode; params: Promise<{ merchantId: string }> }) {
  preloadInter();
  const { merchantId } = await params;
  // An outage is not a sign-out: the screen below says so and offers the counter, which keeps working offline. Only a gone session goes to /login.
  const auth = await requireMeOrOutage(await currentPath(`/m/${merchantId}`));
  if (auth.outage) return <ServiceUnreachable audience="owner" counterHref={`/m/${merchantId}/counter`} />;
  const me = auth.me;
  const membership = me.merchants.find((m) => m.merchantId === merchantId);
  if (!membership && me.platformRole === "none") return <Denied me={me} />;

  const api = (await getServerApi()).merchant(merchantId);
  let detail, features;
  try {
    [detail, features] = await Promise.all([api.detail(), api.features()]);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    if (isApiError(e) && (e.status === 403 || e.status === 401)) return <Denied me={me} />;
    if (isApiError(e) && (e.isNetwork || e.status >= 500)) return <ServiceUnreachable audience="owner" counterHref={`/m/${merchantId}/counter`} />;
    throw e;
  }
  const locale = await getLocale();
  const viewingAs = membership ? null : me.platformRole === "admin" ? "admin" : "rep";
  return (
    <ThemeStyle style={detail.merchant.themeStyle} dark={detail.merchant.themeDark} merchantId={detail.merchant.id}>
      <LocaleScope locale={locale}>
        <SessionGuard />
        <MerchantProvider me={me} initialDetail={detail} initialFeatures={features} role={detail.role} viewingAs={viewingAs}>
          <MerchantShell me={me}>{children}</MerchantShell>
        </MerchantProvider>
      </LocaleScope>
    </ThemeStyle>
  );
}

/** Signed in, but not as staff of this shop (another shop's link, or a shop that does not exist: the same words, so ids are not leaked). */
async function Denied({ me }: { me: authApi.MeResponse }) {
  const t = await getT();
  const home = homeFor(me, t);
  return <AccessDenied title={t("err.denied.shop.title")} description={t("err.denied.shop.body", { address: accountLabel(me.user) })} goHref={home.href} goLabel={home.label} />;
}

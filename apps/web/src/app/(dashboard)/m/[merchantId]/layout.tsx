import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MerchantProvider } from "@/components/dashboard/MerchantContext";
import { MerchantShell } from "@/components/dashboard/MerchantShell";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { getServerApi } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { requireMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false, follow: false } };

/**
 * Merchant dashboard guard (merchant-dashboard.md): signed in + staff at this merchant.
 * Platform admins and the merchant's own rep pass the API's requireStaff and see an
 * impersonation banner ("Viewing as ... Changes are logged.").
 */
export default async function MerchantLayout({ children, params }: { children: ReactNode; params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  const me = await requireMe(`/m/${merchantId}`);
  const membership = me.merchants.find((m) => m.merchantId === merchantId);
  if (!membership && me.platformRole === "none") return <Denied />;

  const api = (await getServerApi()).merchant(merchantId);
  let detail, features;
  try {
    [detail, features] = await Promise.all([api.detail(), api.features()]);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    if (isApiError(e) && (e.status === 403 || e.status === 401)) return <Denied />;
    throw e;
  }
  const locale = await getLocale();
  const viewingAs = membership ? null : me.platformRole === "admin" ? "admin" : "rep";
  return (
    <LocaleScope locale={locale}>
      <MerchantProvider me={me} initialDetail={detail} initialFeatures={features} role={detail.role} viewingAs={viewingAs}>
        <MerchantShell me={me}>{children}</MerchantShell>
      </MerchantProvider>
    </LocaleScope>
  );
}

function Denied() {
  return (
    <Container size="public" className="py-16">
      <NoAccess title="You don't have access to this shop" body="Sign in with the account the owner invited, or ask them to add you as staff." action={<Button href="/m">Go to your dashboard</Button>} />
    </Container>
  );
}

import { QrCode as QrIcon } from "lucide-react";
import type { Metadata } from "next";
import { PageFrame, URDU_LEADING } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PassTopBar } from "@/components/pass/PassChrome";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { JoinFlow } from "./JoinFlow";
import { pickVaried, streetName } from "@/lib/joinCopy";

export type JoinPageProps = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function joinMetadata({ params, searchParams }: JoinPageProps): Promise<Metadata> {
  const { code } = await params;
  const t = await getT(await searchParams);
  try {
    const info = await publicServerApi().public.joinInfo(code);
    return { title: t("auth.join.joinShop", { shop: info.merchant.name }), description: t("wp.t.joinDesc", { shop: info.merchant.name }), robots: { index: false } };
  } catch {
    return { title: t("sh.wallet.join"), robots: { index: false } };
  }
}

/** Dev convenience: fill the OTP with the API's devCode (never present in production APIs). */
function devAutofill() {
  return process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1";
}

/** Shared by /j/[code] and /join/[code] (two URL shapes in the wild). */
export async function JoinPage({ params, searchParams }: JoinPageProps) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  const ref = typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null;
  let info;
  try {
    info = await publicServerApi().public.joinInfo(code);
  } catch (e) {
    if (isApiError(e) && e.status === 404)
      return (
        <PageFrame locale={locale}>
          <EmptyState icon={QrIcon} title={t("auth.err.qrInvalid")} description={t("auth.join.invalidBody")} action={<Button href="/map">{t("auth.join.findShops")}</Button>} />
        </PageFrame>
      );
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("auth.join.loadError")} description={t("auth.err.network")} action={<Button variant="secondary" href={`/j/${encodeURIComponent(code)}`}>{t("auth.error.retry")}</Button>} />
      </PageFrame>
    );
  }
  // The street and its other shops (canvas Join): "works at 16 shops on Roncesvalles", "Also earning here…".
  const api = publicServerApi();
  const { lat, lng } = info.location;
  const [hoods, near] = await Promise.all([
    api.network.neighbourhoods().catch(() => null),
    lat != null && lng != null ? api.network.shops({ lat, lng, radiusMetres: 1500, limit: 40 }).catch(() => null) : Promise.resolve(null),
  ]);
  const hood = hoods?.items.find((h) => h.id === info.merchant.neighbourhoodId) ?? null;
  const name = streetName(hood?.name);
  const street = hood && name ? { name, shopCount: hood.shopCount } : null;
  const others = near ? pickVaried(near.items, info.merchant.id, 3) : [];
  const total = hood ? hood.shopCount - 1 : (near?.items.filter((x) => x.merchant.id !== info.merchant.id).length ?? 0);
  const alsoHere = others.length ? { verticals: others.map((o) => o.merchant.vertical), total } : null;
  const me = await getMe();
  return (
    <LocaleScope locale={locale} trade={info.merchant.vertical} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <JoinFlow
        topSlot={<PassTopBar />}
        street={street}
        alsoHere={alsoHere}
        info={info}
        referralCode={ref}
        signedIn={!!me}
        signedInName={me?.user.name ?? null}
        devAutofill={devAutofill()}
        appStoreUrl={env.appStoreUrl}
        playStoreUrl={env.playStoreUrl}
      />
    </LocaleScope>
  );
}

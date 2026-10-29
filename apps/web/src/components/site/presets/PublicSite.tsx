/**
 * The public website page (server): fetches the published site by slug or host and renders it in the shop's style and the
 * visitor's language. Used by app/(site)/s/[slug] and app/(site)/[domain]. Docs: docs/engineering/site-builder.md.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { siteApi } from "@ll/shared";
import { LogoMark } from "@/components/site/Brand";
import { publicSiteEndpoints } from "@/components/site-builder/siteApi";
import { ThemeStyle } from "@/components/ui/ThemeStyle";
import { createApiClient } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { env, serverApiUrl } from "@/lib/env";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@ll/shared";
import { SiteRenderer } from "./SiteRenderer";

export type SiteLookup = { slug: string } | { host: string };

const api = () => publicSiteEndpoints(createApiClient({ baseUrl: serverApiUrl() }));

export async function loadSite(q: SiteLookup): Promise<siteApi.PublicSiteResponse | null> {
  try {
    return "slug" in q ? await api().bySlug(q.slug) : await api().byHost(q.host);
  } catch (e) {
    if (isApiError(e) && e.status === 404) return null;
    throw e;
  }
}

export async function siteMetadata(q: SiteLookup): Promise<Metadata> {
  const s = await loadSite(q).catch(() => null);
  if (!s) return {};
  const canonical = s.canonicalHost ? `https://${s.canonicalHost}/` : `${env.siteUrl}/s/${s.slug}`;
  return {
    title: { absolute: s.content.copy.seo.title || s.shop.name },
    description: s.content.copy.seo.description,
    alternates: { canonical },
    openGraph: { title: s.content.copy.seo.title || s.shop.name, description: s.content.copy.seo.description, url: canonical },
  };
}

export async function PublicSite({ lookup, searchParams }: { lookup: SiteLookup; searchParams?: Record<string, string | string[] | undefined> }) {
  const s = await loadSite(lookup);
  // /s/<slug> used to redirect to the shop page: with no published site it still does.
  if (!s && "slug" in lookup) redirect(`/shops/${encodeURIComponent(lookup.slug)}`);
  if (!s) notFound();
  const locale = await getLocale(searchParams);
  const t = translator(locale);
  // On a custom domain the shop's own pages (booking, join) live on our host.
  const base = "host" in lookup ? env.siteUrl : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: s.shop.name,
    description: s.content.copy.seo.description,
    url: s.canonicalHost ? `https://${s.canonicalHost}/` : `${env.siteUrl}/s/${s.slug}`,
    image: s.shop.logoUrl ?? undefined,
    telephone: s.shop.phone ?? undefined,
    // The address rule: only a storefront's street address is published.
    address: s.location ? { "@type": "PostalAddress", ...(s.location.address ? { streetAddress: s.location.address, postalCode: s.location.postalCode ?? undefined } : {}), addressLocality: s.location.city ?? undefined, addressCountry: "CA" } : undefined,
  };
  return (
    <ThemeStyle style={s.shop.themeStyle}>
      <LocaleScope locale={locale} trade={s.shop.vertical} className="min-h-dvh bg-background">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        {s.lapseBannerUntil ? (
          <div role="status" className="bg-warning-soft px-4 py-3 text-center text-body text-warning-text">
            {t("site.lapseBanner", { url: `${env.siteUrl.replace(/^https?:\/\//, "")}/s/${s.slug}` })}
          </div>
        ) : null}
        <header className="mx-auto flex w-full max-w-260 items-center justify-between gap-3 px-4 pt-4 md:px-8">
          <span className="text-body-strong text-foreground">{s.shop.name}</span>
          {s.booking.enabled ? (
            <a href={`${base}/shops/${encodeURIComponent(s.slug)}/book`} className="inline-flex min-h-11 items-center rounded-full px-4 text-body font-[550] text-link hover:underline focus-visible:focus-ring">
              {t("site.skipToBook")}
            </a>
          ) : null}
        </header>
        <main id="main" className="mx-auto w-full max-w-260 px-4 pb-16 md:px-8">
          <SiteRenderer data={s} links={{ base }} />
        </main>
        <footer className="mx-auto flex w-full max-w-260 items-center justify-center px-4 pb-10">
          <Link href={`${env.siteUrl}/for-shoppers`} className="inline-flex min-h-11 items-center gap-2 text-meta text-muted-foreground hover:text-foreground">
            <LogoMark size={16} />
            {t("site.madeWith")}
          </Link>
        </footer>
      </LocaleScope>
    </ThemeStyle>
  );
}

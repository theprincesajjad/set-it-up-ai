import { SiteFooter } from "@/components/site/SiteFooter";
import { preloadInter } from "@/lib/fonts/inter";
import { marketingSkipLinkCss } from "@/lib/marketing/fonts";

/**
 * The solo-pro landing pages (/for-nail-techs, /for-barbers, /for-groomers) sit outside the (marketing) layout: they bring their own
 * glass nav (components/marketing/solo/Nav.tsx), and they ship no script beyond the start form, so no client header and no sales chat.
 * Same URLs; the footer is the marketing site's. Their text is Inter, so they preload it (lib/fonts/inter.ts).
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  preloadInter();
  return (
    <div className="bg-background">
      <style href="ll-skip-mkt" precedence="default">
        {marketingSkipLinkCss}
      </style>
      {children}
      <SiteFooter />
    </div>
  );
}

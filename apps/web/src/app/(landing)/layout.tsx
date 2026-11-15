import { CountingOff } from "@/components/marketing/landing-ab/CountingOff";
import { SiteFooter } from "@/components/site/SiteFooter";
import { marketingSkipLinkCss } from "@/lib/marketing/fonts";

/**
 * The solo-pro landing pages (/for-nail-techs, /for-barbers, /for-groomers) sit outside the (marketing) layout: they bring their own
 * glass nav (components/marketing/solo/Nav.tsx), and they ship no script beyond the start form, so no client header and no sales chat.
 * Same URLs; the footer is the marketing site's. Their type is the home page's (Halden text, Strata headlines; SoloLanding preloads
 * Strata), so they draw nothing in Inter and do not preload it.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <style href="ll-skip-mkt" precedence="default">
        {marketingSkipLinkCss}
      </style>
      {children}
      {/* Shown only after "Turn it off" (the URL's #counting-off target). */}
      <CountingOff />
      {/* "Start free" goes to the page's own start form, which knows the trade (sign-up then opens with it chosen). */}
      <SiteFooter startHref="#start" />
    </div>
  );
}

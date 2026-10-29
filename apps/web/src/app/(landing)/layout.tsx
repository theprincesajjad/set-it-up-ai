import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * The solo-pro landing pages (/for-nail-techs, /for-barbers, /for-groomers) sit outside the (marketing) layout: they bring their own
 * glass nav (components/marketing/solo/Nav.tsx), and they ship no script beyond the start form, so no client header and no sales chat.
 * Same URLs; the footer is the marketing site's.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      {children}
      <SiteFooter />
    </div>
  );
}

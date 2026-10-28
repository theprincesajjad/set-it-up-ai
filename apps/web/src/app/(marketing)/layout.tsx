import { Awning } from "@/components/marketing/Awning";
import { SalesChat } from "@/components/marketing/SalesChat";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** Paper canvas for the whole marketing site, with the one awning stripe above the header. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper">
      <Awning />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <SalesChat />
    </div>
  );
}

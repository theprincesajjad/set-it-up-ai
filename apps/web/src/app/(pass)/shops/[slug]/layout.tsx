import type { ReactNode } from "react";
import { ThemeStyle } from "@/components/ui/ThemeStyle";
import { publicServerApi } from "@/lib/api/server";

/**
 * Customer pages for one shop wear the shop's style (Clear by default, or Main Street Warm). Light only: Clear's graphite dark is an
 * owner-screen setting. The page fetches the same public shop; Next memoises the identical GET within the render.
 */
export default async function ShopLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const style = await publicServerApi()
    .public.shop(slug)
    .then((s) => s.merchant.themeStyle)
    .catch(() => undefined);
  return <ThemeStyle style={style}>{children}</ThemeStyle>;
}

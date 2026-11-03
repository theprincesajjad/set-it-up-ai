import Link from "next/link";
import { notFound } from "next/navigation";
import { getMe } from "@/lib/auth/session";
import { MarketingWordmark } from "@/components/marketing/landing/Wordmark";
import type { PhotoSet } from "@/components/marketing/landing/Photo";

/**
 * Wave U: the landing direction the founder chose, at /dev/landing-b (A and C were removed in wave V). Dev only, gated exactly like /dev/kit:
 * open in development, with KIT_SHOWCASE=1, or for a platform admin; a 404 for everyone else in production. Never indexed (the page
 * metadata, plus next.config's X-Robots-Tag on /dev). The live home page (app/(marketing)/page.tsx) is not touched.
 */
export async function devOnly() {
  if (process.env.NODE_ENV === "production" && process.env.KIT_SHOWCASE !== "1") {
    const me = await getMe().catch(() => null);
    if (me?.platformRole !== "admin") notFound();
  }
}

const photo = (name: string, widths: readonly number[], width: number, height: number): PhotoSet => ({ src: `/marketing/photos/${name}`, widths, width, height });

/** Direction B's photos (public/marketing/photos/CREDITS.md). Since wave V the barber, nail and corner store tiles share the live page's new photos. */
export const UPHOTOS = {
  bakery: photo("u-bakery", [900, 1280], 1280, 1600),
  tCafe: photo("u-t-cafe", [480, 720], 720, 900),
  tRepair: photo("u-t-repair", [480, 720], 720, 900),
  tBarber: photo("v-t-barber", [480, 720], 720, 900),
  tNails: photo("v-t-nails", [480, 720], 720, 900),
  tBakery: photo("u-t-bakery", [480, 720], 720, 900),
  tCorner: photo("v-t-corner", [480, 720], 720, 900),
} as const;

export const TILE_PHOTO = { cafe: UPHOTOS.tCafe, repair: UPHOTOS.tRepair, barber: UPHOTOS.tBarber, nails: UPHOTOS.tNails, bakery: UPHOTOS.tBakery, corner: UPHOTOS.tCorner } as const;
export type TileKey = keyof typeof TILE_PHOTO;

/** The top bar every direction shares: the wordmark, three links, log in and the ask. Classes come from each direction's CSS. */
export function TopBar({ cta, prefix, onBlack = false }: { cta: string; prefix: string; onBlack?: boolean }) {
  return (
    <header className={`${prefix}-top`}>
      <div className={`${prefix}-wrap ${prefix}-top-in`}>
        <MarketingWordmark onBlack={onBlack} />
        <nav className={`${prefix}-top-nav`} aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#shops">Shops</a>
          <Link href="/pricing" prefetch={false}>
            Pricing
          </Link>
        </nav>
        <div className={`${prefix}-top-end`}>
          <Link href="/login" prefetch={false} className={`${prefix}-top-login`}>
            Log in
          </Link>
          <Link href="/signup" prefetch={false} className={`${prefix}-btn ${prefix}-btn-sm`} data-cta="nav">
            {cta}
          </Link>
        </div>
      </div>
    </header>
  );
}

import { preload } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * A landing photo or product screenshot (wave T): a static <picture> of AVIF with a WebP fallback, at the widths encoded under
 * public/marketing (see photos/CREDITS.md), with explicit width and height so nothing shifts. Lazy by default; `priority` loads it at
 * once with high fetch priority and preloads it from the document head (the hero, the page's largest paint). `mobile` is an optional
 * art-directed crop for phones (below 768px), preloaded for phones only.
 */
export interface PhotoSet {
  /** Path without the width and extension, e.g. "/marketing/photos/cafe". */
  src: string;
  widths: readonly number[];
  /** Intrinsic size of the largest width (sets the aspect ratio). */
  width: number;
  height: number;
}

const srcset = (s: PhotoSet, ext: "avif" | "webp") => s.widths.map((w) => `${s.src}-${w}.${ext} ${w}w`).join(", ");
const PHONE = "(max-width: 767.98px)";
const WIDE = "(min-width: 768px)";

export function Photo({ set, mobile, alt, sizes, priority = false, preloadMobile = true, className }: { set: PhotoSet; mobile?: PhotoSet; alt: string; sizes: string; priority?: boolean; preloadMobile?: boolean; className?: string }) {
  // `preloadMobile={false}`: on phones the photo sits below the first screen, so it should not take bandwidth from the text and CSS.
  if (priority) {
    if (mobile && preloadMobile) preload(`${mobile.src}-${mobile.widths[0]}.avif`, { as: "image", type: "image/avif", imageSrcSet: srcset(mobile, "avif"), imageSizes: "100vw", media: PHONE, fetchPriority: "high" });
    preload(`${set.src}-${set.widths[0]}.avif`, { as: "image", type: "image/avif", imageSrcSet: srcset(set, "avif"), imageSizes: sizes, media: mobile ? WIDE : undefined, fetchPriority: "high" });
  }
  const small = Math.min(...set.widths);
  return (
    <picture className={cn("lp-pic", className)}>
      {mobile ? <source media={PHONE} type="image/avif" srcSet={srcset(mobile, "avif")} sizes="100vw" width={mobile.width} height={mobile.height} /> : null}
      {mobile ? <source media={PHONE} type="image/webp" srcSet={srcset(mobile, "webp")} sizes="100vw" width={mobile.width} height={mobile.height} /> : null}
      <source type="image/avif" srcSet={srcset(set, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcset(set, "webp")} sizes={sizes} />
      <img src={`${set.src}-${small}.webp`} alt={alt} width={set.width} height={set.height} loading={priority ? "eager" : "lazy"} decoding={priority ? "sync" : "async"} fetchPriority={priority ? "high" : undefined} />
    </picture>
  );
}

const photo = (name: string, widths: readonly number[], width: number, height: number): PhotoSet => ({ src: `/marketing/photos/${name}`, widths, width, height });

/** Every image on the home page, by role (Unsplash, public/marketing/photos/CREDITS.md). Sizes match the encoded widths. */
export const PHOTOS = {
  /** The hero: a baker behind her counter (4:5). */
  heroBakery: photo("u-bakery", [640, 900, 1280], 1280, 1600),
  /** Phones: the same crop without the 1280 width (a 3x phone would pick it for a 300px frame). */
  heroBakeryM: photo("u-bakery", [640, 900], 900, 1125),
  /** The visit: two people setting up at a shop counter (4:3). */
  counterHelp: photo("counter-help", [640, 1000], 1000, 750),
  /** The shop tiles (4:5). */
  tCafe: photo("u-t-cafe", [480, 720], 720, 900),
  tRepair: photo("u-t-repair", [480, 720], 720, 900),
  tBarber: photo("v-t-barber", [480, 720], 720, 900),
  tNails: photo("v-t-nails", [480, 720], 720, 900),
  tCorner: photo("v-t-corner", [480, 720], 720, 900),
  tFlorist: photo("v-t-florist", [480, 720], 720, 900),
} as const;

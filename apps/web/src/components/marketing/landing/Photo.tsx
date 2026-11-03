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

export function Photo({ set, mobile, alt, sizes, priority = false, className }: { set: PhotoSet; mobile?: PhotoSet; alt: string; sizes: string; priority?: boolean; className?: string }) {
  if (priority) {
    if (mobile) preload(`${mobile.src}-${mobile.widths[0]}.avif`, { as: "image", type: "image/avif", imageSrcSet: srcset(mobile, "avif"), imageSizes: "100vw", media: PHONE, fetchPriority: "high" });
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
const shot = (name: string, widths: readonly number[], width: number, height: number): PhotoSet => ({ src: `/marketing/product/${name}`, widths, width, height });

/** Every image on the home page, by role. Sizes match tools/process.py output (the encoded widths). */
export const PHOTOS = {
  cafe: photo("cafe", [960, 1600], 1600, 1067),
  cafeMobile: photo("cafe-m", [800], 800, 600),
  repair: photo("repair", [720, 1200], 1200, 1500),
  barber: photo("barber", [640, 1000], 1000, 750),
  cafePour: photo("cafe-pour", [640, 1000], 1000, 750),
  cornerStore: photo("corner-store", [640, 1000], 1000, 750),
  retail: photo("retail", [480, 800], 800, 1000),
  nails: photo("nails", [480, 800], 800, 1000),
  bakery: photo("bakery", [480, 800], 800, 1000),
  street: photo("street", [480, 800], 800, 1000),
  counterHelp: photo("counter-help", [640, 1000], 1000, 750),
  today: shot("today", [960, 1600], 1600, 1000),
  todayMobile: shot("today-m", [780], 780, 1387),
  counter: shot("counter", [800, 1400], 1400, 973),
  pass: shot("pass", [560, 860], 860, 1327),
} as const;

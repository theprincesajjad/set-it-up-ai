import type { CSSProperties } from "react";
import { photoSrcSet, type SoloPhoto } from "@/lib/marketing/solo";

/**
 * Small server-only pieces of the solo landing page (components/marketing/SoloLanding.tsx). Nothing here ships JavaScript.
 */

/** A Pexels photo from public/marketing: AVIF first, WebP fallback, explicit size so nothing shifts. Decorative unless `alt` is given. */
export function Photo({ photo, sizes, alt = "", eager, priority }: { photo: SoloPhoto; sizes: string; alt?: string; /** Above the fold: never lazy. */ eager?: boolean; /** The hero photo (preloaded): fetched first. */ priority?: boolean }) {
  const style: CSSProperties | undefined = photo.pos ? { objectPosition: photo.pos } : undefined;
  return (
    <picture>
      <source type="image/avif" srcSet={photoSrcSet(photo, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={photoSrcSet(photo, "webp")} sizes={sizes} />
      <img
        src={`/marketing/${photo.stem}-${photo.widths[0]}.webp`}
        alt={alt}
        width={photo.w}
        height={photo.h}
        loading={eager || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        style={style}
      />
    </picture>
  );
}

/** One of our 3D objects as its 96 px PNG (public/icons3d), shown at 28 to 30 px inside chips and rows. Lighter than the sprite. */
export function Obj({ name, size = 28 }: { name: string; size?: number }) {
  return <img className="sl-obj" src={`/icons3d/${name}@2x.png`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

export function Check({ width = 3 }: { width?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Plus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Our mark in Clear (ink tile, four places), as a notification and pass icon. */
export function Mark() {
  return (
    <span className="sl-mark" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** `n` → the stagger class `sl-n<n>` (solo.css), in place of an inline `--n`. */
export const n = (i: number) => `sl-n${i}`;

"use client";
/**
 * Wave Q (customer): a card that rises in under a success screen (join success, booking confirmation), the kit's BlurFade (motion) loaded
 * on demand so motion never ships with the page itself. Plain children where the browser has no IntersectionObserver (old browsers, jsdom)
 * and, inside BlurFade, under prefers-reduced-motion.
 */
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

const BlurFade = dynamic(() => import("@/components/primitives/blur-fade").then((m) => m.BlurFade), { ssr: false });

export function Reveal({ children, delay = 0, still = false }: { children: ReactNode; /** Seconds after mount. */ delay?: number; /** No entrance motion: for a screen that is also rendered on the server (motion is client-only, so it would not hydrate). */ still?: boolean }) {
  const [motionOk] = useState(() => typeof window !== "undefined" && "IntersectionObserver" in window);
  if (still || !motionOk) return <>{children}</>;
  return <BlurFade delay={delay}>{children}</BlurFade>;
}

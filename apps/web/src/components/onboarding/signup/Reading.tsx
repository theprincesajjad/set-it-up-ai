"use client";
/**
 * "Reading yourshop.ca…" (wave Q kit): a browser card with the host, a page sketch with a scan line running over it, and a checklist whose
 * rows blur in one after another (Magic UI BlurFade on motion) and tick as the read moves on. Loaded on demand from LinkStep, so motion
 * stays out of the first signup screen. Reduced motion: no scan, no blur, rows shown at once.
 */
import { Check, Globe, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BlurFade } from "@/components/primitives/blur-fade";
import { Icon3d } from "@/components/ui/Icon3d";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { hostOf, isInstagram } from "./draft";

export function Reading({ target, done }: { target: string; done: boolean }) {
  const { t } = useLocaleOrEnglish();
  const reduce = useReducedMotion();
  const insta = isInstagram(target);
  const items = insta ? [t("sf.read.handle"), t("sf.read.s4")] : [t("sf.read.s1"), t("sf.read.s2"), t("sf.read.s3"), t("sf.read.s4")];
  const [at, setAt] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAt((n) => Math.min(n + 1, items.length - 1)), 700);
    return () => clearInterval(id);
  }, [items.length]);
  const ticked = done ? items.length : at;
  const host = insta ? `@${target.replace(/^@/, "").replace(/^.*instagram\.com\//i, "").replace(/\/.*$/, "")}` : hostOf(target);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-4 pb-16 pt-8 md:px-6 md:pt-14" data-import-progress>
      <div className="animate-in fade-in-0 duration-300 motion-reduce:animate-none">
        <Icon3d name="site" size={64} trade="inherit" surface="canvas" />
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-[28px] font-[700] leading-8.5 tracking-[-0.02em] text-fg outline-none md:text-[34px] md:leading-10">
          {t("sf.read.title", { site: host })}
        </h1>
        <p className="mt-3 text-[15px] leading-5.5 text-fg-muted">{t("sf.read.body")}</p>
        <div className="mt-8 overflow-hidden rounded-r4 border border-border bg-card shadow-float">
          {/* The browser bar: three dots and the address. */}
          <div className="flex items-center gap-3 border-b border-border bg-bg-subtle px-4 py-2.5">
            <span aria-hidden className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-lg-seg-track" />
              <span className="size-2.5 rounded-full bg-lg-seg-track" />
              <span className="size-2.5 rounded-full bg-lg-seg-track" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-3 py-1 ring-1 ring-border">
              <Globe aria-hidden className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
              <span dir="ltr" className="min-w-0 truncate text-meta text-fg-muted">
                <bdi>{host}</bdi>
              </span>
            </span>
          </div>
          {/* A sketch of the page being read, with a scan line in the shop's colour. */}
          <div aria-hidden className="relative overflow-hidden border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <span className={cn("size-10 shrink-0 rounded-full transition-colors duration-500", ticked >= 2 ? "bg-trade" : "bg-lg-seg-track")} />
              <div className="flex flex-1 flex-col gap-2">
                <span className={cn("h-2.5 w-2/5 rounded-full transition-colors duration-500", ticked >= 1 ? "bg-fg" : "bg-lg-seg-track")} />
                <span className="h-2 w-3/5 rounded-full bg-lg-seg-track" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("h-10 rounded-r2 transition-colors duration-500", ticked >= 3 ? "bg-trade-soft" : "bg-bg-subtle")} />
              ))}
            </div>
            {!reduce && !done ? (
              <motion.span
                className="pointer-events-none absolute inset-x-0 h-8 bg-linear-to-b from-transparent via-trade/15 to-transparent"
                initial={{ top: "-20%" }}
                animate={{ top: ["-20%", "100%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}
          </div>
          <div aria-hidden className="relative h-1 overflow-hidden bg-lg-seg-track">
            <div className="absolute inset-y-0 start-0 rounded-e-full bg-trade transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(8, (ticked / items.length) * 100)}%` }} />
          </div>
          <ol role="status" aria-live="polite" className="flex flex-col gap-3.5 p-5">
            {items.map((s, i) => {
              const ok = i < ticked;
              const now = i === ticked;
              return (
                <li key={s} className="contents" data-read-item={ok ? "done" : now ? "now" : "todo"}>
                  <BlurFade delay={0.12 * i} offset={8} direction="up" className={cn("flex items-center gap-3 text-body transition-colors duration-300", ok || now ? "text-fg" : "text-fg-subtle")}>
                    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full transition-all duration-300 motion-reduce:transition-none", ok ? "scale-100 bg-trade text-trade-foreground" : "scale-90 border border-border-strong")}>
                      {ok ? <Check className="size-3.5 animate-in zoom-in-50 duration-200 motion-reduce:animate-none" strokeWidth={3} /> : now ? <Loader2 className="size-3.5 animate-spin text-fg-muted motion-reduce:animate-none" /> : null}
                    </span>
                    {s}
                    <span className="sr-only">{ok ? t("onboarding.kit.done") : ""}</span>
                  </BlurFade>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

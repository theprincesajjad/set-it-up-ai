"use client";
/**
 * "You're live" (wave P, restyled with the wave Q kit): confetti from the check mark in the shop's colours, their card (leaning toward the
 * pointer on desktop), the join QR and link in a raised panel, and the next steps as a swipeable row of cards (CardCarousel, embla). Loaded
 * on demand by SignupWizard (next/dynamic), so motion, embla and confetti never weigh on the first six steps.
 */
import { ArrowRight, Check, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TRIAL_DAYS } from "@ll/shared";
import type { Icon3dName } from "@ll/design-tokens";
import { BlurFade } from "@/components/primitives/blur-fade";
import { Button, buttonClasses } from "@/components/ui/Button";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { celebrate } from "@/components/ui/Celebrate";
import { Icon3d } from "@/components/ui/Icon3d";
import { QrCode } from "@/components/ui/QrCode";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { CardPreview } from "./CardPreview";
import { cardFor, type SignupDraft } from "./draft";

export interface NextStep {
  icon: Icon3dName;
  title: string;
  body: string;
  href: string;
}

export interface LiveStepProps {
  draft: SignupDraft;
  nextSteps: NextStep[];
  primaryHref: string;
  primaryLabel: string;
  onLeave: () => void;
}

export function LiveStep({ draft, nextSteps, primaryHref, primaryLabel, onLeave }: LiveStepProps) {
  const { t } = useLocaleOrEnglish();
  const shop = draft.created!;
  const card = cardFor(shop.vertical, draft.card);
  const [copied, setCopied] = useState(false);
  // Rendered on the client only (the flow waits for the saved answers), so the browser can be asked directly.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const link = shop.joinUrl;
  // Kit (wave Q): one confetti burst from the check mark in the shop's colours (lazy canvas-confetti; nothing under reduced motion).
  const check = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => void celebrate({ origin: check.current }), 350);
    return () => window.clearTimeout(id);
  }, []);
  const preview = <CardPreview name={shop.name} vertical={shop.vertical} brandColor={shop.brandColor} logo={shop.logo} card={card} tilt className="animate-in zoom-in-95 fade-in-0 duration-500 motion-reduce:animate-none" />;
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col px-4 pb-36 pt-8 md:px-6 md:pb-16 md:pt-12" data-step="live">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-14">
        <div className="flex min-w-0 flex-col animate-in fade-in-0 slide-in-from-bottom-3 duration-500 motion-reduce:animate-none">
          <span ref={check} aria-hidden className="relative grid size-14 place-items-center rounded-full bg-trade text-trade-foreground shadow-float animate-in zoom-in-50 duration-500 motion-reduce:animate-none">
            <span className="absolute inset-0 rounded-full bg-trade opacity-40 animate-ping [animation-iteration-count:2] motion-reduce:hidden" />
            <Check className="relative size-7" strokeWidth={3} />
          </span>
          <h1 tabIndex={-1} data-autofocus className="mt-5 text-balance text-[30px] font-[700] leading-9 tracking-[-0.02em] text-fg outline-none md:text-[40px] md:leading-11.5">
            {t("sf.live.title", { name: shop.name })}
          </h1>
          <p className="mt-3 text-[15px] leading-5.5 text-fg-muted">{t("sf.live.body", { days: TRIAL_DAYS })}</p>
          <div className="mt-8 lg:hidden">{preview}</div>
          <BlurFade delay={0.25} direction="up" offset={10} className="mt-10 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-headline text-fg">{t("sf.live.next")}</h2>
            </div>
            <p className="mt-1 text-meta text-fg-muted">{t("sf.live.nextHint")}</p>
            <div className="mt-4" data-live-next>
              <CardCarousel
                label={t("sf.live.next")}
                basis="basis-[82%] sm:basis-[47%]"
                items={nextSteps.map((s, i) => (
                  <NextCard key={s.href + s.title} step={s} n={i + 1} onLeave={onLeave} />
                ))}
              />
            </div>
          </BlurFade>
          <div className="z-sticky mt-8 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:mt-0 max-md:border-t max-md:border-border max-md:bg-bg/95 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur-md" data-flow-footer>
            <Link href={primaryHref} onClick={onLeave} className={buttonClasses({ size: "lg", fullWidth: true })} data-live-primary>
              <span>{primaryLabel}</span>
              <ArrowRight aria-hidden className="size-[var(--icon)] shrink-0 rtl:rotate-180" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="hidden lg:block">{preview}</div>
          {link ? (
            <BlurFade delay={0.15} direction="up" offset={10}>
              <section className="flex flex-col items-center gap-4 overflow-hidden rounded-r4 border border-border bg-card p-5 text-center shadow-float" aria-labelledby="live-qr" data-live-share>
                <h2 id="live-qr" className="text-body font-[550] text-fg">
                  {t("sf.live.qr")}
                </h2>
                <div className="rounded-r4 bg-trade-soft p-4">
                  <div className="rounded-r3 bg-card p-3 shadow-sm ring-1 ring-border">
                    <QrCode value={link} size={168} label={t("sf.live.qrLabel", { name: shop.name })} />
                  </div>
                </div>
                <p dir="ltr" className="max-w-full truncate rounded-full bg-bg-subtle px-3 py-1 text-meta text-fg-muted">
                  <bdi>{link.replace(/^https?:\/\//, "")}</bdi>
                </p>
                <div className={cn("grid w-full gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
                  <Button
                    variant="secondary"
                    iconStart={copied ? Check : Copy}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        // Clipboard blocked: the link is on screen to copy by hand.
                      }
                    }}
                  >
                    {copied ? t("sf.live.copied") : t("sf.live.copy")}
                  </Button>
                  {canShare ? (
                    <Button variant="secondary" iconStart={Share2} onClick={() => navigator.share({ title: shop.name, url: link }).catch(() => undefined)}>
                      {t("sf.live.share")}
                    </Button>
                  ) : null}
                </div>
              </section>
            </BlurFade>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One next step as a card: the 3D object on a tile in the shop's soft colour, the step number, title, one line, and "Start". */
function NextCard({ step, n, onLeave }: { step: NextStep; n: number; onLeave: () => void }) {
  const { t } = useLocaleOrEnglish();
  return (
    <Link
      href={step.href}
      onClick={onLeave}
      className="group flex h-full min-h-[200px] flex-col gap-3 rounded-r4 border border-border bg-card p-4 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float focus-visible:focus-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="grid size-14 place-items-center rounded-r3 bg-trade-soft">
          <Icon3d name={step.icon} size={40} trade="inherit" />
        </span>
        <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-caption font-[550] tabular-nums text-fg-muted">{t("sf.live.nStep", { n })}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-[600] text-fg">{step.title}</span>
        <span className="mt-1 block text-meta text-fg-muted">{step.body}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-meta font-[600] text-link">
        {t("sf.live.start")}
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={2} />
      </span>
    </Link>
  );
}

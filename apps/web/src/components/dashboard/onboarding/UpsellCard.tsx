"use client";
import type { merchantApi } from "@ll/shared";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAction } from "@/lib/dashboard/useApi";

/**
 * The paid-tier moment. Shown only after the shop is active (offer) or, for restaurants, at 10 members while
 * on pace (one quiet line). Never before the first stamp and never while behind pace.
 */
export function UpsellCard({ upsell, base, activeLine, onDismiss }: { upsell: merchantApi.OnboardingUpsell; base: string; activeLine?: string; onDismiss: () => Promise<void> }) {
  const act = useAction();
  if (upsell.moment === "none") return null;
  if (upsell.moment === "preview")
    return (
      <p className="border-t border-line pt-4 text-meta text-fg-muted">
        Restaurants like yours also take orders on their own page. <a className="text-fg underline underline-offset-2" href={`${base}/billing`}>Ask us about it</a>.
      </p>
    );
  return (
    <section aria-label="Next step for your shop" className="flex flex-col gap-3 rounded-card bg-tile-butter p-6 text-tile-butter-foreground">
      {activeLine ? (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1 text-meta-strong text-positive-text">
          <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
          {activeLine}
        </p>
      ) : null}
      <h2 className="font-display text-title font-bold">{upsell.headline}</h2>
      <p className="text-meta-strong">Your regulars are on the card. Now grow it.</p>
      <p className="max-w-[62ch] text-body">
        {upsell.body} It is {upsell.priceLine}.
      </p>
      {upsell.foundingLine ? <p className="w-fit rounded-full bg-card px-3 py-1.5 text-meta-strong text-points-text">{upsell.foundingLine}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button href={`${base}/billing`}>{upsell.foundingLine ? "See the founding offer" : "See what is included"}</Button>
        <Button variant="secondary" loading={act.busy} onClick={() => void act.run(onDismiss)}>
          Not now
        </Button>
      </div>
    </section>
  );
}

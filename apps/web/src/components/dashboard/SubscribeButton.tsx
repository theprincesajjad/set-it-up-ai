"use client";
import { useState } from "react";
import type { FeatureOffer } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/errors";
import { useMerchant } from "./MerchantContext";

/** One tap to the checkout for the plan that has a locked feature (Café & Retail, Service or a restaurant tier). Owners only. */
export function SubscribeButton({ offer, size = "sm", variant = "primary", label }: { offer: Extract<FeatureOffer, { kind: "plan" | "restaurant" }>; size?: "sm" | "md"; variant?: "primary" | "secondary"; label?: string }) {
  const { api, base, refresh } = useMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = `$${offer.priceCents / 100}`;
  // site.builder and anything else that needs the annual plan: check out yearly (featureOffer sets interval "year").
  const interval = offer.kind === "plan" && offer.interval === "year" ? "year" : "month";
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const urls = { successUrl: `${origin}${base}/billing?checkout=success`, cancelUrl: `${origin}${base}/billing?checkout=cancelled` };
      if (offer.kind === "restaurant") {
        // Already on a lower restaurant tier: move up (prorated by Stripe) instead of opening a second checkout.
        const mine = await api.billing.restaurant();
        if (mine.subscription) {
          await api.billing.restaurantChange(offer.tier);
          await refresh();
          setBusy(false);
          return;
        }
        window.location.assign((await api.billing.restaurantCheckout({ tier: offer.tier, interval: "month", ...urls })).url);
        return;
      }
      window.location.assign((await api.billing.checkout({ plan: offer.plan, interval, ...urls })).url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size={size} variant={variant} loading={busy} onClick={() => void go()}>
        {label ?? (interval === "year" ? `Subscribe to ${offer.name} yearly, ${price}/year` : `Subscribe to ${offer.name}, ${price}/mo`)}
      </Button>
      {error ? <span role="alert" className="text-meta text-negative">{error}</span> : null}
    </span>
  );
}

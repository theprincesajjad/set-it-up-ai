"use client";
import { useState } from "react";
import type { FeatureOffer } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/dashboard/useApi";
import { useMerchant } from "./MerchantContext";

/** Where a paid checkout comes back to: the tool the owner was unlocking (kept for the test-mode stand-in page as well). */
export const CHECKOUT_RETURN_KEY = "ll.checkout.return";

/** One tap to the checkout for the plan that has a locked feature (Pro, Studio, Service or a restaurant tier). Owners only. */
export function SubscribeButton({ offer, size = "sm", variant = "primary", label }: { offer: Extract<FeatureOffer, { kind: "plan" | "restaurant" }>; size?: "sm" | "md"; variant?: "primary" | "secondary"; label?: string }) {
  const { api, refresh } = useMerchant();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A restaurant already on a lower tier moves up, prorated, with no second checkout: say so before anything is charged.
  const mine = useApi(offer.kind === "restaurant" ? () => api.billing.restaurant() : null, [api, offer.kind]);
  const sub = mine.data?.subscription ?? null;
  const from = mine.data?.plans.find((p) => p.current) ?? null;
  const to = mine.data?.plans.find((p) => p.tier === (offer.kind === "restaurant" ? offer.tier : "")) ?? null;
  const price = `$${offer.priceCents / 100}`;
  // site.builder and anything else that needs the annual plan: check out yearly (featureOffer sets interval "year").
  const interval = offer.kind === "plan" && offer.interval === "year" ? "year" : "month";
  const yearly = sub?.interval === "year";
  const per = yearly ? "a year" : "a month";
  const cents = (p: { priceCents: number; annualPriceCents: number } | null, fallback: number) => `$${((yearly ? p?.annualPriceCents : p?.priceCents) ?? fallback) / 100}`;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      // Back to the tool the owner was unlocking; the page shows the confirmation and waits for the payment to land.
      const origin = window.location.origin;
      const path = window.location.pathname;
      const urls = { successUrl: `${origin}${path}?checkout=success`, cancelUrl: `${origin}${path}` };
      try {
        sessionStorage.setItem(CHECKOUT_RETURN_KEY, urls.successUrl);
        sessionStorage.setItem("ll.checkout.plan", offer.name);
      } catch {
        /* private mode */
      }
      if (offer.kind === "restaurant") {
        const current = mine.data ?? (await api.billing.restaurant());
        if (current.subscription) {
          setConfirming(true);
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

  async function move() {
    if (offer.kind !== "restaurant") return;
    setBusy(true);
    setError(null);
    try {
      await api.billing.restaurantChange(offer.tier);
      await refresh();
      setConfirming(false);
      toast({ message: `You’re on ${offer.name}`, tone: "success" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size={size} variant={variant} loading={busy && !confirming} onClick={() => void go()}>
        {label ?? (sub ? `Upgrade to ${offer.name}, ${cents(to, offer.priceCents)} ${per}` : interval === "year" ? `Subscribe to ${offer.name} yearly, ${price} a year` : `Subscribe to ${offer.name}, ${price} a month`)}
      </Button>
      {error && !confirming ? <span role="alert" className="text-meta text-negative">{error}</span> : null}
      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title={`Move to ${offer.name}?`}
        description={`${cents(to, offer.priceCents)} ${per} instead of ${cents(from, 0)}. The difference for the rest of this period is charged today.`}
        actions={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>{from ? `Keep ${from.name}` : "Keep my plan"}</Button>
            <Button loading={busy} onClick={() => void move()}>Move to {offer.name}</Button>
          </>
        }
      >
        {error ? <p role="alert" className="text-meta text-negative">{error}</p> : null}
      </Modal>
    </span>
  );
}

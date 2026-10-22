"use client";
/** Stripe Payment Element (wallets first). Loaded lazily only when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set. */
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState } from "react";
import { copy } from "@/copy/en-CA";
import { formatMoney } from "@/lib/format";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(key: string) {
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export interface StripePaymentProps {
  publishableKey: string;
  clientSecret: string;
  amountCents: number;
  label?: string;
  onSucceeded: () => void | Promise<void>;
}

function Form({ amountCents, label, onSucceeded }: Omit<StripePaymentProps, "publishableKey" | "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError(null);
        const { error: err } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
        if (err) {
          setError(err.type === "card_error" ? err.message ?? copy.err.paymentDeclined : copy.err.paymentDeclined);
          setBusy(false);
          return;
        }
        await onSucceeded();
        setBusy(false);
      }}
    >
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!stripe}>
        {label ?? `Pay ${formatMoney(amountCents)}`}
      </Button>
      <p className="text-caption text-fg-muted">Payments processed securely by Stripe.</p>
    </form>
  );
}

export default function StripePayment({ publishableKey, clientSecret, ...rest }: StripePaymentProps) {
  return (
    <Elements stripe={getStripe(publishableKey)} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#1F6A50", borderRadius: "8px", fontFamily: "Figtree, system-ui, sans-serif" } } }}>
      <Form {...rest} />
    </Elements>
  );
}

"use client";
/** Stripe Payment Element for a SetupIntent: saves a card or bank account without charging. Loaded lazily with a publishable key. */
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState } from "react";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { stripeAppearance } from "@/lib/stripeAppearance";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(key: string) {
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export interface StripeSetupProps {
  publishableKey: string;
  clientSecret: string;
  label: string;
  onSucceeded: () => void | Promise<void>;
}

function Form({ label, onSucceeded }: Omit<StripeSetupProps, "publishableKey" | "clientSecret">) {
  const { t } = useLocaleOrEnglish();
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
        const { error: err } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
        if (err) {
          setError(err.type === "card_error" || err.type === "validation_error" ? (err.message ?? t("wp.pay.declined")) : t("wp.pay.declined"));
          setBusy(false);
          return;
        }
        await onSucceeded();
        setBusy(false);
      }}
    >
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!stripe}>
        {label}
      </Button>
    </form>
  );
}

export default function StripeSetup({ publishableKey, clientSecret, ...rest }: StripeSetupProps) {
  return (
    <Elements stripe={getStripe(publishableKey)} options={{ clientSecret, appearance: stripeAppearance() }}>
      <Form {...rest} />
    </Elements>
  );
}

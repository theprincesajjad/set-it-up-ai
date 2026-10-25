"use client";
/**
 * Collect a payment for a PaymentIntent the API created (quote deposit, invoice).
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set → Stripe Payment Element.
 * - Otherwise (local dev with FakePayments) → "Pay with a test card" that calls
 *   POST /v1/payments/fake/simulate (docs/engineering/api/payments.md). Nothing is charged.
 * The server marks things paid from the webhook, so callers poll afterwards.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/format";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

const StripePayment = dynamic(() => import("./StripePayment"), { ssr: false, loading: () => <Skeleton className="h-40 w-full rounded-card" /> });

export interface PaymentBoxProps {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  label?: string;
  /** Called after the payment is confirmed client-side; poll the resource here. */
  onPaid: () => void | Promise<void>;
}

export function PaymentBox({ paymentIntentId, clientSecret, amountCents, label, onPaid }: PaymentBoxProps) {
  const { t } = useLocaleOrEnglish();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (env.stripePublishableKey) {
    return <StripePayment publishableKey={env.stripePublishableKey} clientSecret={clientSecret} amountCents={amountCents} label={label} onSucceeded={onPaid} />;
  }
  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong/60 p-4">
      {/* l10n-ok: shown only when Stripe is not configured (local development) */}
      <p className="text-meta-strong text-fg">Test payment (development)</p>
      {/* l10n-ok: development-only notice */}
      <p className="text-meta text-fg-muted">Stripe isn&apos;t configured on this site, so this simulates a successful card payment through the API&apos;s fake payments provider. Nothing is charged.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button
        size="lg"
        fullWidth
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await browserApi.dev.simulatePayment(paymentIntentId, "succeed_payment");
            await onPaid();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label ?? t("ms.ticket.pay", { amount: formatMoney(amountCents) })}
      </Button>
    </div>
  );
}

/** Poll `check` until it returns true (max ~20 s). */
export async function pollUntil(check: () => Promise<boolean>, { tries = 20, intervalMs = 1000 } = {}): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

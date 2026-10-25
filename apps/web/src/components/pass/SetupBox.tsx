"use client";
/**
 * Save a payment method for a SetupIntent the API created ("change card" on a tiffin subscription). Nothing is charged.
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set: Stripe Payment Element in setup mode.
 * - Otherwise (local dev with FakePayments): "Save a test card" through POST /v1/payments/fake/simulate.
 * The API saves the method from the webhook, so callers poll afterwards.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

const StripeSetup = dynamic(() => import("./StripeSetup"), { ssr: false, loading: () => <Skeleton className="h-40 w-full rounded-card" /> });

export interface SetupBoxProps {
  setupIntentId: string;
  clientSecret: string;
  label: string;
  /** Called once the method is confirmed client-side; poll for the saved card here. */
  onSaved: () => void | Promise<void>;
}

export function SetupBox({ setupIntentId, clientSecret, label, onSaved }: SetupBoxProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (env.stripePublishableKey) return <StripeSetup publishableKey={env.stripePublishableKey} clientSecret={clientSecret} label={label} onSucceeded={onSaved} />;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong/60 p-4">
      {/* l10n-ok: shown only when Stripe is not configured (local development) */}
      <p className="text-meta-strong text-fg">Test card (development)</p>
      {/* l10n-ok: development-only notice */}
      <p className="text-meta text-fg-muted">Stripe isn&apos;t configured on this site, so this saves a test card through the API&apos;s fake payments provider. Nothing is charged.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button
        size="lg"
        fullWidth
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await browserApi.dev.simulatePayment(setupIntentId, "succeed_setup");
            await onSaved();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
    </div>
  );
}

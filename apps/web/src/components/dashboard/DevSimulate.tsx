"use client";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { safeNext } from "@/lib/routes";

/**
 * Stand-in for Stripe-hosted pages when the API runs FakePayments (docs/engineering/api/payments.md).
 * Nothing is charged; the button asks the API to simulate the webhook Stripe would send.
 */
export function DevSimulate({ title, body, action, id, cta, returnTo }: { title: string; body: string; action: "complete_checkout" | "complete_onboarding" | null; id: string | null; cta: string; returnTo: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => {
    let r = returnTo;
    try {
      r ??= sessionStorage.getItem("ll.checkout.return");
    } catch {
      /* ignore */
    }
    const url = r && /^https?:\/\//.test(r) ? new URL(r).pathname + new URL(r).search : safeNext(r, "/m");
    window.location.assign(url);
  };
  return (
    <div className="mx-auto max-w-[480px] px-4 py-16">
      <Card padding="lg" className="flex flex-col gap-4">
        <p className="text-overline uppercase text-fg-muted">Test mode</p>
        <h1 className="text-h2 text-fg">{title}</h1>
        <p className="text-body text-fg-muted">{body}</p>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if (action && id) await browserClient.post("/v1/payments/fake/simulate", { action, id }, { anonymous: true });
              back();
            } catch (e) {
              setError(errorMessage(e));
              setBusy(false);
            }
          }}
        >
          {cta}
        </Button>
        <Button variant="ghost" onClick={back}>
          Go back
        </Button>
      </Card>
    </div>
  );
}

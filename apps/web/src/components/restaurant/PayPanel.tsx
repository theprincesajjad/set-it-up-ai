"use client";
import { useState } from "react";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { browserClient } from "@/lib/api/browser";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import type { commerceApi } from "@ll/shared";
import { useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

/**
 * Card or wallet payment for an order the API just created (Stripe Payment Element: Apple Pay and Google Pay show first on phones that have them).
 * The webhook marks the order paid, so after Stripe confirms we poll the order until `done` says it has landed, then call `onDone`.
 */
export function PayPanel({ orderId, payment, label, done, onDone, orderHref }: { orderId: string; payment: NonNullable<commerceApi.PlaceOrderResponse["payment"]>; label: string; done: (o: commerceApi.OrderDto) => boolean; onDone: () => void; orderHref: string }) {
  const { t } = useFmt();
  const [checking, setChecking] = useState(false);
  const [stuck, setStuck] = useState(false);

  async function paid() {
    setChecking(true);
    setStuck(false);
    const ok = await pollUntil(async () => done(await api.order(orderId)));
    setChecking(false);
    if (ok) onDone();
    else setStuck(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {checking ? <Banner tone="info">{t("orderPay.confirming")}</Banner> : null}
      {stuck ? (
        <Banner tone="warning" title={t("rs.pay.stuckTitle")}>
          <span className="flex flex-col items-start gap-2">
            {t("rs.pay.stuckBody")}
            <Button size="sm" variant="secondary" href={orderHref}>
              {t("rs.pay.viewOrder")}
            </Button>
          </span>
        </Banner>
      ) : null}
      {!checking ? <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={label} onPaid={paid} /> : null}
    </div>
  );
}

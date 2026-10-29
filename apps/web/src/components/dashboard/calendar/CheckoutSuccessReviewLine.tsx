"use client";
/**
 * The quiet line under the checkout success state (phase-pro P4).
 * Free: "Ask {name} for a Google review? On Pro this goes out by itself two hours after every visit. See Pro".
 * Pro with the switch on and a request waiting: "A review request goes to {name} at {time}."
 * Anything else (switch off, nobody to ask): nothing, so the line never promises what won't happen.
 */
import { PLANS } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { browserClient } from "@/lib/api/browser";
import { appointmentReviewsApi, firstName } from "@/lib/dashboard/reviews";
import { useApi } from "@/lib/dashboard/useApi";
import { formatTime } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function CheckoutSuccessReviewLine({ appointmentId, clientName }: { appointmentId: string; clientName: string | null | undefined }) {
  const { merchantId, base } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const status = useApi(() => appointmentReviewsApi(browserClient, merchantId).status(appointmentId), [merchantId, appointmentId]);
  const s = status.data;
  if (!s) return null;
  const name = firstName(clientName, t("revreq.yourClient"));
  if (!s.available)
    return (
      <div data-testid="review-line-free">
        <PlanLine href={`${base}/billing`} linkLabel={t("promo.planCta", { plan: PLANS.plus.name })}>
          {t("revreq.checkoutFree", { name, plan: PLANS.plus.name })}
        </PlanLine>
      </div>
    );
  if (!s.scheduled || !s.sendAt) return null;
  return (
    <p className="text-body text-muted-foreground" data-testid="review-line-pro">
      {t("revreq.checkoutPro", { name, time: formatTime(s.sendAt) })}
    </p>
  );
}

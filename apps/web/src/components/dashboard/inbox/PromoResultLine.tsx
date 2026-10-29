"use client";
/** phase-solo D: the last promo's result on Home ("Valentine's nails: sent to 112, 12 booked from this"), for 30 days after it went out. */
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Row, Rows, SurfaceCard, TradeTile } from "@/components/ui/ClearKit";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { isAppointmentLed } from "@/lib/dashboard/people";

export function PromoResultLine() {
  const { api, base, detail, enabled, role } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const on = role !== "instructor" && (enabled("promos.basic") || isAppointmentLed(detail.merchant.vertical, enabled("booking.appointments")));
  const last = useApi(on ? () => api.regularsPromos.last() : null, [api, on]);
  const r = last.data?.result;
  if (!r || Date.now() - new Date(r.sentAt).getTime() > 30 * 86_400_000) return null;
  return (
    <SurfaceCard className="mt-4" data-testid="promo-result-home">
      <Rows ruleTop={false}>
        <Row
          leading={<TradeTile icon={Megaphone} />}
          title={t("promo.lastTitle")}
          subtitle={t("promo.result", { title: r.title, n: r.recipients, booked: r.booked })}
          trailing={<Link href={`${base}/messages/promos`} className="inline-flex min-h-11 items-center text-meta text-link">{t("promo.title")}</Link>}
        />
      </Rows>
    </SurfaceCard>
  );
}
